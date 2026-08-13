"""index_reports — 텍스트로 추출된 리포트를 Chroma에 적재하는 인덱싱 스크립트.

report_retriever.py의 `_chroma_collection()`은 이 스크립트와 같은 임베딩 함수
(SentenceTransformerEmbeddingFunction, 기본 모델 paraphrase-multilingual-mpnet-base-v2)를
`get_collection(..., embedding_function=...)`으로 명시해서 연다 — 그래야
`collection.query(query_texts=[query], ...)` 호출 시 Chroma가 이 스크립트가
적재할 때 쓴 것과 같은 벡터 공간으로 쿼리를 임베딩한다. 두 파일이 모델명을
CHROMA_EMBEDDING_MODEL 환경변수로 공유하니, 바꾸려면 양쪽 다 같이 바꿔야 한다.
하이브리드 검색(BM25+RRF)은 이번 범위 밖이다 — plain semantic query만 지원한다.

사용법:
    python -m scripts.index_reports \
        --input-dir ./data/reports \
        --metadata ./data/reports/metadata.csv \
        --collection reports

입력:
    --input-dir 안의 리포트 1건당 .txt/.md 파일 1개 (다른 확장자는 무시한다).
    --metadata 는 .json 또는 .csv:
      - .json: {파일명: {title, house, date, category, tags, url, id}} 매핑.
        tags는 리스트.
      - .csv: id,title,house,analyst,date,category,tags,url 헤더.
        id가 파일명(확장자 제외)과 같아야 매칭된다. tags는 세미콜론(;) 구분.
    매핑에 없는 필드는 빈 값으로 둔다 — 별도 경고 로직은 만들지 않는다.
    category는 debenture/economy/invest 중 하나여야 report_retriever.py의
    시장정세형(게시판 교차) 검색이 정상 동작한다.

청킹 (PDF에서 뽑은 텍스트라 마크다운 헤딩이 없는 경우가 대부분이라는 전제로 짰다):
    1) 헤딩(#/##/###)이 있으면 헤딩 단위로, 없으면 전체를 빈 줄 기준 문단으로 1차 분할.
    2) 표(| 문법)가 섞인 조각은 쪼개지도 합쳐지지도 않고 늘 독립 청크로 유지한다.
    3) 그 외 조각은 300~400 토큰(근사치) 목표로 인접한 작은 조각끼리 이어붙이고,
       혼자서 400 토큰을 넘는 조각은 구분자 우선순위 ["\n\n", "\n", ". ", " ", ""]로
       재귀 분할한 뒤 조각 사이 10~20% 오버랩을 둔다.
       (작은 문단을 이어붙이지 않으면 PDF 추출 특유의 한두 줄짜리 파편이 그대로
       각각 청크가 되어버린다 — 실제 리포트 텍스트로 확인한 문제라 넣었다.)

재실행:
    같은 report_id의 기존 청크를 지우고 다시 넣는다 (중복 삽입 방지).
    존재하지 않는 파일·손상된 텍스트 등은 지금은 방어하지 않는다 — 정상 입력만 가정.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

# report_retriever.py의 CHROMA_EMBEDDING_MODEL과 반드시 같은 값이어야 한다.
DEFAULT_EMBEDDING_MODEL = os.environ.get(
    "CHROMA_EMBEDDING_MODEL", "paraphrase-multilingual-mpnet-base-v2"
)

CHUNK_MAX_TOKENS = 400
CHUNK_MIN_TOKENS = 300
CHUNK_OVERLAP_RATIO = 0.15  # 10~20% 사이
RECURSIVE_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]

_HEADING_RE = re.compile(r"^(#{1,3})\s+.+$", re.MULTILINE)
_TABLE_LINE_RE = re.compile(r"^\s*\|.*\|\s*$")


# ── 토큰 근사치 (정밀 토크나이저 없이 청킹 임계값 판단용) ──────────
def _approx_tokens(text: str) -> int:
    korean_chars = len(re.findall(r"[가-힣]", text))
    other_words = len(re.findall(r"[A-Za-z0-9]+", text))
    return korean_chars + int(other_words * 1.3)


def _has_table(text: str) -> bool:
    return any(_TABLE_LINE_RE.match(line) for line in text.splitlines())


# ── 1차 분할: 헤딩 우선, 없으면 문단 ────────────────────────────
def _split_by_heading(text: str) -> list[str]:
    matches = list(_HEADING_RE.finditer(text))
    if not matches:
        return [text]
    sections = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        section = text[start:end].strip()
        if section:
            sections.append(section)
    return sections or [text]


def _split_by_paragraph(text: str) -> list[str]:
    parts = re.split(r"\n\s*\n", text)
    return [p.strip() for p in parts if p.strip()] or [text]


# ── 2차 분할: 토큰 상한 초과 시 구분자 우선순위대로 재귀 분할 ──────
def _merge_pieces(pieces: list[str], sep: str) -> list[str]:
    """토큰 상한 안에서 조각을 최대한 이어붙인다 (langchain RecursiveCharacterTextSplitter와 동일한 전략)."""
    chunks: list[str] = []
    buf = ""
    for piece in pieces:
        candidate = (buf + sep + piece) if buf else piece
        if _approx_tokens(candidate) <= CHUNK_MAX_TOKENS:
            buf = candidate
        else:
            if buf:
                chunks.append(buf)
            buf = piece
    if buf:
        chunks.append(buf)
    return chunks


def _add_overlap(chunks: list[str]) -> list[str]:
    if len(chunks) <= 1:
        return chunks
    out = [chunks[0]]
    for i in range(1, len(chunks)):
        prev = chunks[i - 1]
        overlap_len = int(len(prev) * CHUNK_OVERLAP_RATIO)
        out.append(prev[-overlap_len:] + chunks[i])
    return out


def _recursive_split(text: str, seps: list[str]) -> list[str]:
    """토큰 상한 안으로 재귀 분할한다 (오버랩 없음 — 오버랩은 섹션당 한 번,
    호출부에서 최종 조각들에만 적용한다. 재귀 단계마다 적용하면 겹침이 중첩된다)."""
    if _approx_tokens(text) <= CHUNK_MAX_TOKENS or not seps:
        return [text]

    sep, rest = seps[0], seps[1:]
    pieces = [p for p in (text.split(sep) if sep else list(text)) if p]
    merged = _merge_pieces(pieces, sep)

    out: list[str] = []
    for chunk in merged:
        if _approx_tokens(chunk) > CHUNK_MAX_TOKENS:
            out.extend(_recursive_split(chunk, rest))
        else:
            out.append(chunk)
    return out


def _pack_units(units: list[str]) -> list[str]:
    """작은 조각은 300~400 토큰 목표로 인접한 것끼리 이어붙이고, 혼자서 상한을
    넘는 조각은 재귀 분할한다. 표는 무엇과도 합치지 않고 항상 독립 청크로 낸다.

    이게 없으면(작은 조각을 그냥 append만 하면) PDF에서 뽑은 텍스트 특유의
    한두 줄짜리 문단 파편이 전부 각자 청크가 되어버린다 — 실측으로 확인한 문제."""
    chunks: list[str] = []
    buf = ""

    def flush() -> None:
        nonlocal buf
        if buf:
            chunks.append(buf)
            buf = ""

    for unit in units:
        if _has_table(unit):
            flush()
            chunks.append(unit)
            continue
        if _approx_tokens(unit) > CHUNK_MAX_TOKENS:
            flush()
            chunks.extend(_add_overlap(_recursive_split(unit, RECURSIVE_SEPARATORS)))
            continue
        candidate = f"{buf}\n\n{unit}" if buf else unit
        if _approx_tokens(candidate) <= CHUNK_MAX_TOKENS:
            buf = candidate
        else:
            flush()
            buf = unit
    flush()
    return chunks


def chunk_report(text: str) -> list[str]:
    sections = _split_by_heading(text)
    if len(sections) == 1:
        return _pack_units(_split_by_paragraph(sections[0]))

    # 헤딩이 있으면 헤딩 경계를 넘어서까지 합치지 않는다 — 서로 다른 주제를 섞지 않기 위함.
    chunks: list[str] = []
    for section in sections:
        chunks.extend(_pack_units(_split_by_paragraph(section)))
    return chunks


# ── 메타데이터 ──────────────────────────────────────────────
def load_metadata_map(path: Path) -> dict:
    """파일명 → 메타데이터 dict. .json 또는 .csv(id,title,house,analyst,date,
    category,tags,url 헤더, tags는 세미콜론 구분)를 지원한다."""
    if path.suffix.lower() == ".csv":
        return _load_metadata_csv(path)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _load_metadata_csv(path: Path) -> dict:
    meta_map: dict = {}
    with open(path, encoding="utf-8-sig", newline="") as f:  # utf-8-sig: 엑셀 내보내기 BOM 대비
        for row in csv.DictReader(f):
            report_id = (row.get("id") or "").strip()
            if not report_id:
                continue
            row["tags"] = [t.strip() for t in (row.get("tags") or "").split(";") if t.strip()]
            for ext in (".txt", ".md"):
                meta_map[report_id + ext] = row
    return meta_map


def build_meta(filename: str, meta_map: dict) -> dict:
    """0번 섹션 필드(title/house/date/category/tags) + report_id.
    매핑에 없는 필드는 빈 값으로 둔다."""
    entry = meta_map.get(filename, {})
    report_id = entry.get("id") or Path(filename).stem
    tags = entry.get("tags", [])
    if isinstance(tags, list):
        tags = ",".join(tags)  # Chroma 메타데이터는 리스트를 지원하지 않는다
    return {
        "report_id": report_id,
        "title": entry.get("title", ""),
        "house": entry.get("house", ""),
        "date": entry.get("date", ""),
        "category": entry.get("category", ""),
        "tags": tags,
    }


# ── 컬렉션 연결 ─────────────────────────────────────────────
def _get_collection(collection_name: str, embedding_fn):
    host = os.environ.get("CHROMA_HOST", "")
    path = os.environ.get("CHROMA_PATH", "./chroma_db")
    if host:
        client = chromadb.HttpClient(host=host, port=int(os.environ.get("CHROMA_PORT", "8001")))
    else:
        client = chromadb.PersistentClient(path=path)
    return client.get_or_create_collection(
        name=collection_name,
        embedding_function=embedding_fn,
        metadata={"hnsw:space": "cosine"},
    )


# ── 파일 단위 인덱싱 ────────────────────────────────────────
def index_file(collection, path: Path, meta_map: dict) -> int:
    text = path.read_text(encoding="utf-8")
    meta = build_meta(path.name, meta_map)
    report_id = meta["report_id"]

    # 같은 report_id 재실행 시 중복 방지 — 기존 청크를 지우고 다시 넣는다
    existing = collection.get(where={"report_id": report_id})
    if existing["ids"]:
        collection.delete(ids=existing["ids"])

    chunks = chunk_report(text)
    if not chunks:
        return 0

    ids = [f"{report_id}::chunk{i}" for i in range(len(chunks))]
    metadatas = [dict(meta) for _ in chunks]
    collection.add(ids=ids, documents=chunks, metadatas=metadatas)
    return len(chunks)


def main() -> None:
    parser = argparse.ArgumentParser(description="리포트 텍스트를 Chroma에 적재한다.")
    parser.add_argument("--input-dir", required=True, help="리포트 .txt/.md 파일이 있는 폴더")
    parser.add_argument("--metadata", required=True, help="파일명 → 메타데이터 매핑 JSON")
    parser.add_argument("--collection", default=os.environ.get("CHROMA_COLLECTION", "reports"))
    parser.add_argument("--embedding-model", default=DEFAULT_EMBEDDING_MODEL)
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    meta_map = load_metadata_map(Path(args.metadata))

    embedding_fn = SentenceTransformerEmbeddingFunction(model_name=args.embedding_model)
    collection = _get_collection(args.collection, embedding_fn)

    files = sorted(p for p in input_dir.iterdir() if p.suffix in (".txt", ".md"))
    total_chunks = 0
    for path in files:
        n = index_file(collection, path, meta_map)
        total_chunks += n
        print(f"[index_reports] {path.name}: {n}개 청크 적재")

    print(
        f"[index_reports] 완료 — 파일 {len(files)}개, 총 청크 {total_chunks}개, "
        f"컬렉션 '{args.collection}' (현재 {collection.count()}건)"
    )


if __name__ == "__main__":
    main()
