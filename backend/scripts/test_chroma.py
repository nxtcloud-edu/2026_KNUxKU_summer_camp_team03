"""Chroma 연결 확인 스크립트 — DB 담당과 필드명 맞출 때 사용.

실행 (backend 폴더, venv에서):
    python scripts/test_chroma.py

성공하면: 컬렉션 문서 수 + 샘플 1건의 id/metadata를 보여준다.
그 metadata 필드명을 보고 report_store._row_from_chroma를 맞추면 된다.
"""
import os, sys
from dotenv import load_dotenv
load_dotenv()

host, path = os.environ.get("CHROMA_HOST",""), os.environ.get("CHROMA_PATH","")
name = os.environ.get("CHROMA_COLLECTION","reports")
if not host and not path:
    sys.exit(".env에 CHROMA_HOST(서버) 또는 CHROMA_PATH(파일) 를 먼저 설정하세요")

import chromadb
client = chromadb.HttpClient(host=host, port=int(os.environ.get("CHROMA_PORT","8001"))) if host \
    else chromadb.PersistentClient(path=path)
print("연결 OK. 컬렉션 목록:", [c.name for c in client.list_collections()])
col = client.get_collection(name)
print(f"컬렉션 '{name}': {col.count()}건")
sample = col.peek(1)
print("샘플 id:", sample["ids"])
print("샘플 metadata:", sample["metadatas"])
print("샘플 문서 앞 200자:", (sample["documents"][0] or "")[:200] if sample["documents"] else "")
q = col.query(query_texts=["장기채 금리 전망"], n_results=3)
print("검색 테스트 top3 ids:", q["ids"][0])
