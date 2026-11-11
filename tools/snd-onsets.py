# 녹음 파일에서 소리 구간(시작, 길이, 최대 레벨)을 찾아 출력. python3 -I tools/snd-onsets.py <파일> [문턱 dB] [최소 무음 s]
import sys, subprocess, numpy as np
def load(path, sr=48000):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32), sr
def segments(x, sr, thr_db=-34, gap=0.12):
    win = int(sr * 0.005)
    n = len(x) // win
    env = np.abs(x[:n * win]).reshape(n, win).max(axis=1)
    peak = env.max() or 1
    on = env > peak * 10 ** (thr_db / 20)
    segs = []; start = None; last = None
    for i, v in enumerate(on):
        if v:
            if start is None: start = i
            last = i
        elif start is not None and (i - last) * 0.005 > gap:
            segs.append((start * 0.005, (last + 1 - start) * 0.005, float(env[start:last + 1].max() / peak)))
            start = None
    if start is not None: segs.append((start * 0.005, (last + 1 - start) * 0.005, float(env[start:last + 1].max() / peak)))
    return segs, peak
if __name__ == '__main__':
    for path in sys.argv[1:]:
        if path.startswith('--'): continue
        x, sr = load(path)
        thr = float(next((a.split('=')[1] for a in sys.argv if a.startswith('--thr=')), -34))
        gap = float(next((a.split('=')[1] for a in sys.argv if a.startswith('--gap=')), 0.12))
        segs, peak = segments(x, sr, thr, gap)
        print(path.split('/')[-1], 'dur %.2f peak %.2f segs %d' % (len(x) / sr, peak, len(segs)))
        print('   ' + ' '.join('%.2f+%.2f(%.2f)' % s for s in segs[:60]))
