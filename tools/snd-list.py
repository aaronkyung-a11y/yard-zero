# 받은 효과음 묶음을 풀고(각자 x/ 아래) 파일별 길이를 출력. python3 -I 로 실행
import sys, os, zipfile, subprocess
root = sys.argv[1]
for d in sorted(os.listdir(root)):
    if not d.startswith('snd-') or d == 'snd-firearm': continue
    p = os.path.join(root, d)
    x = os.path.join(p, 'x')
    for f in os.listdir(p):
        fp = os.path.join(p, f)
        if f.endswith('.zip') and not os.path.isdir(x):
            zipfile.ZipFile(fp).extractall(x)
        if f.endswith('.7z') and not os.path.isdir(x):
            import py7zr
            with py7zr.SevenZipFile(fp) as z: z.extractall(x)
    out = []
    for dp, _, fs in os.walk(p):
        for f in sorted(fs):
            if f.lower().endswith(('.wav', '.ogg', '.mp3', '.flac')):
                fp = os.path.join(dp, f)
                r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fp], capture_output=True, text=True).stdout.strip()
                out.append((os.path.relpath(fp, p), float(r or 0)))
    print('==', d, len(out))
    print('  ' + '  '.join('%s(%.2f)' % (n, t) for n, t in out[:70]))
