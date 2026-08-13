"""(구명칭) chat_service → supervisor로 개명됨. 호환용 재수출."""
from .supervisor import *  # noqa: F401,F403
from .supervisor import handle  # noqa: F401
