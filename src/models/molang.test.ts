import { describe, expect, it } from 'vitest';
import { compileMolang } from './molang';

const ev = (s: string, t = 0) => compileMolang(s)({ animTime: t });

describe('molang', () => {
  it('aritmética y precedencia', () => {
    expect(ev('1+2*3')).toBe(7);
    expect(ev('-(2+3)*2')).toBe(-10);
    expect(ev('10/4')).toBe(2.5);
  });
  it('funciones en grados y tiempo de animación', () => {
    expect(ev('math.sin(90)')).toBeCloseTo(1);
    expect(ev('math.sin(q.anim_time*90)', 1)).toBeCloseTo(1);
    expect(ev('math.clamp(query.anim_time*10, 0, 3)', 1)).toBe(3);
  });
  it('ternarios y comparaciones', () => {
    expect(ev('q.anim_time > 0.5 ? 4 : 2', 1)).toBe(4);
    expect(ev('q.anim_time > 0.5 ? 4 : 2', 0)).toBe(2);
  });
  it('lo desconocido vale 0', () => {
    expect(ev('v.algo + 3')).toBe(3);
  });
});
