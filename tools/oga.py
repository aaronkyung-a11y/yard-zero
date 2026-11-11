# OpenGameArt 페이지의 라이선스와 파일 목록을 출력 (python3 -I 로 실행)
import re, sys, subprocess, html
for slug in sys.argv[1:]:
    h = subprocess.run(['curl', '-sS', '-m', '30', 'https://opengameart.org/content/' + slug], capture_output=True).stdout.decode('utf-8', 'replace')
    lic = sorted(set(re.findall(r"class='license-name'>([^<]*)", h)))
    files = re.findall(r'href="(https://opengameart.org/sites/default/files/[^"]+\.(?:zip|ogg|wav|mp3|flac|7z|rar))"[^>]*>[^<]*</a>\s*([^<]*)', h)
    author = re.findall(r"class='username'>([^<]*)", h)[:1]
    print('==', slug, '|', ','.join(lic), '|', author)
    for u, sz in files[:12]:
        print('   ', html.unescape(u.split('/')[-1]), sz.strip())
