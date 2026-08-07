"""
Key masking utility — masks API keys for safe display in UI and API responses.
"""


def mask_key(value: str | None) -> str:
    """
    Mask an API key for display.
    - Keys >= 12 chars: first 7 + '****' + last 4
    - Keys 4-11 chars: first 2 + '****' + last 2
    - Keys < 4 chars: '****'
    - Empty/None: ''
    """
    if not value:
        return ""
    length = len(value)
    if length >= 12:
        return value[:7] + "****" + value[-4:]
    elif length >= 4:
        return value[:2] + "****" + value[-2:]
    else:
        return "****"
