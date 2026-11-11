# CC0 녹음에서 게임용 효과음을 잘라 MP3로 만들고 src/samples.js를 생성한다.
# 사용: python3 -I tools/make-sounds.py <yz-assets 경로> <프로젝트 경로>
import sys, os, subprocess, numpy as np
A, P = sys.argv[1], sys.argv[2]
SR = 44100
F = A + '/snd-firearm/x/Prepared SFX Library/'
FALL = A + '/snd-fall/x/bfh1_'
ST1 = A + '/snd-steps1/x/Fantozzi-footsteps/flac/Fantozzi-Stone'
TH = A + '/snd-thwack/x/PCM/thwack-'
SG = A + '/snd-sgreload/x/ShotgunSounds/'
_cache = {}
def load(path):
    if path not in _cache:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
        _cache[path] = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    return _cache[path]
def cut(path, start=0.0, dur=None):
    x = load(path)
    i0 = max(0, int((start - 0.004) * SR))
    return x[i0:] if dur is None else x[i0:i0 + int(dur * SR)]
def norm(x):
    return x / (np.abs(x).max() or 1)
def build(layers, length, fade=0.25, drive=0.0, peak=0.89):
    n = int(length * SR); y = np.zeros(n)
    for path, start, gain, delay in layers:
        s = norm(cut(path, start, length)); d = int(delay * SR)
        m = min(len(s), n - d)
        if m > 0: y[d:d + m] += s[:m] * gain
    # 30Hz 아래 제거
    a = np.exp(-2 * np.pi * 30 / SR); lp = 0.0; out = np.empty(n)
    for i in range(n):
        lp = a * lp + (1 - a) * y[i]; out[i] = y[i] - lp
    y = norm(out)
    if drive > 0: y = np.tanh(y * drive) / np.tanh(drive)
    fi = int(0.002 * SR); y[:fi] *= np.linspace(0, 1, fi)
    fo = int(fade * length * SR) if fade < 1 else int(fade)
    fo = max(1, min(n, int(fade * n)))
    y[n - fo:] *= np.linspace(1, 0, fo) ** 2
    return y * peak
L = lambda path, start=0.0, gain=1.0, delay=0.0: (path, start, gain, delay)
SPEC = {
    'shotAR': [dict(layers=[L(F + 'AR-15/D_32P.wav', 0.70), L(F + 'AR-15/D_24P.wav', 0.55, 0.45)], length=0.8, drive=1.6),
               dict(layers=[L(F + 'AR-15/D_32P.wav', 5.65), L(F + 'AR-15/D_24P.wav', 3.91, 0.45)], length=0.8, drive=1.6)],
    'shotSG': [dict(layers=[L(F + 'Mossberg/N_30P.wav', 1.70), L(F + 'Mossberg/N_26P.wav', 0.79, 0.5)], length=1.0, drive=1.8),
               dict(layers=[L(F + 'Mossberg/N_30P.wav', 4.96), L(F + 'Mossberg/N_26P.wav', 4.57, 0.5)], length=1.0, drive=1.8)],
    'shotDMR': [dict(layers=[L(F + 'Tikka/W_29P.wav', 0.58), L(F + 'Tikka/W_24P.wav', 0.75, 0.45)], length=1.1, drive=1.7),
                dict(layers=[L(F + 'Tikka/W_29P.wav', 5.66), L(F + 'Tikka/W_24P.wav', 5.38, 0.45)], length=1.1, drive=1.7)],
    'shotPistol': [dict(layers=[L(F + 'Walther PPQ/X_39P.wav', 1.41), L(F + 'Walther PPQ/X_31P.wav', 1.08, 0.4)], length=0.6, drive=1.5),
                   dict(layers=[L(F + 'Walther PPQ/X_39P.wav', 6.44), L(F + 'Walther PPQ/X_31P.wav', 5.24, 0.4)], length=0.6, drive=1.5)],
    'shotFar': [dict(layers=[L(F + 'SKS/U_19P.wav', t)], length=0.8, drive=1.2) for t in (2.61, 8.02, 12.79)],
    'step': [dict(layers=[L(ST1 + s + '.flac'), L(A + '/snd-steps2/x/stone01.ogg', 0, 0.5)], length=0.34, fade=0.4) for s in ('L1', 'R1', 'L2', 'R2', 'L3', 'R3')],
    'stepM': [dict(layers=[L(A + '/snd-steps3/x/metal_steps_%s.wav' % s), L(A + '/snd-steps2/x/stone01.ogg', 0, 0.35)], length=0.26, fade=0.4) for s in ('01', '04', '09', '24')],
    'hit': [dict(layers=[L(TH + s + '.wav')], length=0.24, fade=0.4) for s in ('02', '06', '07')],
    'head': [dict(layers=[L(TH + '02.wav'), L(A + '/snd-metal/clink2.wav', 0, 0.7, 0.004)], length=0.3, fade=0.4)],
    'bodyfall': [dict(layers=[L(FALL + 'hit_06.ogg'), L(FALL + 'metal_hit_02.ogg', 0, 0.22, 0.07)], length=0.6, fade=0.35),
                 dict(layers=[L(TH + '08.wav'), L(FALL + 'metal_hit_06.ogg', 0, 0.18, 0.09)], length=0.7, fade=0.35)],
    'grunt': [dict(layers=[L(A + '/snd-grunt/g.wav', t)], length=d, fade=0.3) for t, d in ((6.95, 0.46), (29.87, 0.5), (40.41, 0.66), (38.83, 0.64))],
    'hurt': [dict(layers=[L(A + '/snd-punch/x/qubodupPunch/qubodupPunch01.flac')], length=0.4, fade=0.4),
             dict(layers=[L(A + '/snd-punch/x/qubodupPunch/qubodupPunch05.flac')], length=0.4, fade=0.4)],
    'impact': [dict(layers=[L(FALL + 'rock_hit_01.ogg')], length=0.13, fade=0.4), dict(layers=[L(FALL + 'hit_09.ogg')], length=0.24, fade=0.4), dict(layers=[L(FALL + 'hit_04.ogg')], length=0.3, fade=0.5)],
    'impactM': [dict(layers=[L(FALL + 'metal_hit_06.ogg')], length=0.34, fade=0.4), dict(layers=[L(FALL + 'metal_hit_03.ogg')], length=0.36, fade=0.4), dict(layers=[L(A + '/snd-metal/bing1.wav')], length=0.4, fade=0.5)],
    'casing': [dict(layers=[L(A + '/snd-metal/clink%d.wav' % i)], length=0.26, fade=0.4) for i in (1, 2, 3)],
    'clink': [dict(layers=[L(A + '/snd-metal/thud3.wav'), L(A + '/snd-metal/clink1.wav', 0, 0.3, 0.01)], length=0.4, fade=0.4)],
    'boom': [dict(layers=[L(A + '/snd-expl/e1.ogg'), L(A + '/snd-expl/chunky.mp3', 0.03, 0.8)], length=2.8, fade=0.5, drive=1.5)],
    'rlAR': [dict(layers=[L(A + '/snd-reload/r2.wav', 0.1)], length=1.42, fade=0.1)],
    'rlPistol': [dict(layers=[L(A + '/snd-reload/r1.wav', 0.02)], length=1.5, fade=0.1)],
    'pump': [dict(layers=[L(A + '/snd-reload/r3.wav', 0.05), L(SG + 'Rack.mp3', 0.61, 0.25)], length=0.44, fade=0.25)],
    'shellIn': [dict(layers=[L(SG + 'Subsequent Shells.mp3', 0.68)], length=0.55, fade=0.3), dict(layers=[L(SG + 'First Shell.mp3', 0.36)], length=0.5, fade=0.3)],
    'equip': [dict(layers=[L(A + '/snd-clicks/eq.wav', 0.09)], length=0.26, fade=0.3)],
    'dry': [dict(layers=[L(A + '/snd-clicks/eq.wav', 1.07)], length=0.13, fade=0.3)],
}
out = P + '/assets/snd'
os.makedirs(out, exist_ok=True)
for f in os.listdir(out): os.remove(os.path.join(out, f))
total = 0; secs = 0; js_imp = []; js_map = []
k = 0
for name, items in SPEC.items():
    ids = []
    for i, it in enumerate(items):
        y = build(**it).astype(np.float32)
        fn = '%s_%d.mp3' % (name, i + 1)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '80k', os.path.join(out, fn)], input=y.tobytes(), check=True)
        total += os.path.getsize(os.path.join(out, fn)); secs += len(y) / SR
        js_imp.append("import s%d from '../assets/snd/%s';" % (k, fn)); ids.append('s%d' % k); k += 1
    js_map.append('  %s: [%s],' % (name, ', '.join(ids)))
open(P + '/src/samples.js', 'w').write('// tools/make-sounds.py가 생성. CC0 녹음 샘플(MP3, base64)\n' + '\n'.join(js_imp) + '\nexport const SAMPLES = {\n' + '\n'.join(js_map) + '\n};\n')
print('files', k, 'seconds %.1f' % secs, 'bytes', total)
