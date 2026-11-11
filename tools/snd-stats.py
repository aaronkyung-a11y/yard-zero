# 파일별 음색 요약: 길이, 무게중심 주파수, 저역(<250Hz)·고역(>4kHz) 에너지 비율, 감쇠 시간. python3 -I 로 실행
import sys, subprocess, numpy as np
for path in sys.argv[1:]:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32); sr = 44100
    if len(x) < 256: continue
    i0 = int(np.argmax(np.abs(x) > 0.1 * np.abs(x).max()))
    y = x[i0:i0 + int(sr * 0.6)]
    S = np.abs(np.fft.rfft(y * np.hanning(len(y)))) ** 2; f = np.fft.rfftfreq(len(y), 1 / sr)
    tot = S.sum() or 1
    cen = (S * f).sum() / tot
    env = np.abs(x[i0:]); win = int(sr * 0.01); n = len(env) // win
    e = env[:n * win].reshape(n, win).max(axis=1); pk = e.max()
    t20 = next((i for i in range(int(np.argmax(e)), n) if e[i] < pk * 0.1), n) * 0.01
    print('%-34s dur %.2f cen %5.0f lo %.2f hi %.2f t-20dB %.2f' % (path.split('/')[-1][:34], len(x) / sr, cen, S[f < 250].sum() / tot, S[f > 4000].sum() / tot, t20))
