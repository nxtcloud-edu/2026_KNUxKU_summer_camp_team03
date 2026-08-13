"""Gemini 연결 자가 진단 — uvicorn 없이 키·모델·네트워크를 단계별로 확인.

실행 (backend 폴더에서):
    python scripts\\test_gemini.py
"""
import os
import sys

print("=" * 50)
print("1단계: .env 로드")
try:
    from dotenv import load_dotenv
except ImportError:
    sys.exit("❌ python-dotenv 미설치 → 지금 파이썬에: pip install python-dotenv")

found = load_dotenv()
print(f"   .env 파일 발견: {'예' if found else '아니오 ← backend 폴더에서 실행했는지 확인'}")

key = os.environ.get("GEMINI_API_KEY", "")
model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
if not key:
    sys.exit("❌ GEMINI_API_KEY가 비어 있음 → backend\\.env에 키 줄이 있는지 확인")
if key.startswith("your_"):
    sys.exit("❌ 키가 예시 문구 그대로임 → 실제 키로 교체 필요")
print(f"   키 확인: {key[:10]}... (길이 {len(key)})")
print(f"   모델: {model}")

print("2단계: Gemini 호출")
import requests

try:
    resp = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        params={"key": key},
        json={"contents": [{"role": "user", "parts": [{"text": "한 단어로 인사해줘"}]}]},
        timeout=15,
    )
except requests.RequestException as e:
    sys.exit(f"❌ 네트워크 오류: {e}\n   → 방화벽/프록시/와이파이 확인")

print(f"   HTTP 상태: {resp.status_code}")
if resp.status_code == 200:
    text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
    print(f"✅ 성공! Gemini 응답: {text.strip()[:50]}")
    print("   → uvicorn을 완전히 껐다 켜면(Ctrl+C 후 재실행) 챗봇도 LLM을 씁니다")
elif resp.status_code in (400, 403):
    print("❌ 키가 유효하지 않음 (잘못 복사됐거나 비활성 키)")
    print("   → https://aistudio.google.com/apikey 에서 새 키 발급 후 .env 교체")
    print(f"   서버 메시지: {resp.text[:300]}")
elif resp.status_code == 429:
    print("❌ 쿼터 초과 — 잠시 후 재시도하거나 다른 키 사용")
elif resp.status_code == 404:
    print(f"❌ 모델명 '{model}' 을 찾을 수 없음 (구모델 은퇴 가능성)")
    print("3단계: 이 키로 사용 가능한 모델 조회")
    try:
        lm = requests.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            params={"key": key, "pageSize": "50"}, timeout=15)
        lm.raise_for_status()
        names = [m["name"].split("/")[-1] for m in lm.json().get("models", [])
                 if "generateContent" in m.get("supportedGenerationMethods", [])]
        flash = [n for n in names if "flash" in n and "preview" not in n and "exp" not in n]
        print("   사용 가능(생성용):", ", ".join(names[:15]) or "없음")
        candidates = flash + [n for n in names if n not in flash]
        picked = None
        for cand in candidates[:5]:
            t = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{cand}:generateContent",
                params={"key": key},
                json={"contents": [{"role": "user", "parts": [{"text": "hi"}]}]},
                timeout=15)
            if t.status_code == 200:
                picked = cand
                break
        if picked:
            print(f"✅ 동작 확인된 모델: {picked}")
            print(f"   → backend\\.env 에서 GEMINI_MODEL={picked} 로 바꾸고")
            print("   → uvicorn 완전 재시작(Ctrl+C 후 재실행)하면 끝!")
        else:
            print("❌ 후보 모델들도 실패 — 목록을 복사해서 공유해 주세요")
    except requests.RequestException as e:
        print(f"   모델 목록 조회 실패: {e}")
else:
    print(f"❌ 예상 밖 응답: {resp.text[:300]}")
