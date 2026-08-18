"""R1/R3/R5a web integration: open the R1 web build, fill relay address + 6-digit
pairing code from relay-pair-integration.txt, pair, and capture screenshots."""
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

SHOTS = Path(__file__).parent
text = (SHOTS / "relay-pair-integration.txt").read_text(encoding="utf-8")
m = re.search(r"RELAY_PAIR_CODE=(\d{6})", text)
CODE = m.group(1) if m else (sys.argv[1] if len(sys.argv) > 1 else None)
if not CODE:
    raise SystemExit("no pairing code found")


def shot(page, name, delay=2500):
    page.wait_for_timeout(delay)
    page.screenshot(path=str(SHOTS / name))


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.goto("http://127.0.0.1:8098", wait_until="networkidle", timeout=30000)
    page.get_by_text("harness remote").first.wait_for(timeout=15000)
    shot(page, "relay-mode-01-home.png", 1500)

    page.get_by_placeholder("relay.example.com").fill("127.0.0.1")
    page.get_by_placeholder(re.compile("6 位配对码")).fill(CODE)
    shot(page, "relay-mode-02-filled.png", 1000)

    page.get_by_role("button", name="连接").click()
    page.wait_for_url("**/sessions", timeout=20000)
    shot(page, "relay-mode-03-sessions.png", 2500)

    # Settings via the sessions header (keeps React context; no page reload).
    page.get_by_role("button", name="设置").first.click()
    page.get_by_text("目标主机", exact=True).wait_for(timeout=10000)
    page.get_by_text("模型与权限", exact=True).wait_for(timeout=10000)
    shot(page, "relay-mode-04-settings.png", 2000)

    # Plugin page via settings entry.
    page.get_by_text("用户插件", exact=True).first.click()
    page.get_by_text("插件指令", exact=True).first.wait_for(timeout=10000)
    shot(page, "relay-mode-05-plugins.png", 2000)
    evidence = page.locator("body").inner_text()
    (SHOTS / "relay-mode-find.txt").write_text(
        "\n".join(
            line
            for line in evidence.splitlines()
            if any(k in line for k in ["插件指令", "Ping", "通知级别", "用户插件", "模型", "思考强度", "上下文容量", "审批权限"])
        ),
        encoding="utf-8",
    )

    # Back: plugins → settings → sessions → home (paired online state).
    page.go_back(wait_until="networkidle", timeout=20000)
    page.go_back(wait_until="networkidle", timeout=20000)
    page.go_back(wait_until="networkidle", timeout=20000)
    page.get_by_text("使用远程模式连接").wait_for(timeout=10000)
    page.get_by_text("断开连接").wait_for(timeout=10000)
    shot(page, "relay-mode-06-paired-home.png", 1500)

    browser.close()
print("screenshots done")
