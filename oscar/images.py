"""Email images, fetched by Oscar instead of your browser, the way Gmail does it.

The sender sees Oscar's request, not your IP address, browser or cookies. Since an email
decides which address is fetched, only public web addresses are allowed (never this
computer, your network or a cloud server's own address), every redirect is checked the
same way, and only real images up to 5 MB come back. No SVG: it can carry scripts.
"""

import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import httpx

MAX_BYTES = 5_000_000
MAX_REDIRECTS = 3
TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp", "image/x-icon"}


class ImageError(RuntimeError):
    pass


def lookup(host: str) -> list[str]:
    try:
        return [info[4][0] for info in socket.getaddrinfo(host, None)]
    except (socket.gaierror, UnicodeError):
        return []


def public(host: str) -> bool:
    """True when every address the name points to is on the public internet."""
    host = host.strip("[]")
    try:
        addresses = [str(ipaddress.ip_address(host))]
    except ValueError:
        addresses = lookup(host)
    if not addresses:
        return False
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        if not ip.is_global or ip.is_multicast:
            return False
    return True


def fetch(url: str, http: httpx.Client) -> tuple[bytes, str]:
    """The image's bytes and type, or ImageError."""
    for _ in range(MAX_REDIRECTS + 1):
        parts = urlparse(url)
        if parts.scheme not in ("http", "https") or not parts.hostname or not public(parts.hostname):
            raise ImageError("Not a public web address.")
        request = http.build_request("GET", url, headers={"User-Agent": "Oscar image proxy", "Accept": "image/*"})
        response = http.send(request, stream=True, follow_redirects=False)
        try:
            if response.is_redirect:
                url = urljoin(url, response.headers.get("location", ""))
                continue
            kind = response.headers.get("content-type", "").split(";")[0].strip().lower()
            if response.status_code != 200 or kind not in TYPES:
                raise ImageError("Not an image.")
            data = b""
            for chunk in response.iter_bytes():
                data += chunk
                if len(data) > MAX_BYTES:
                    raise ImageError("Too big.")
            return data, kind
        finally:
            response.close()
    raise ImageError("Too many redirects.")
