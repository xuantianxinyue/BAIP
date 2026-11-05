import { describe, expect, it } from 'vitest';
import { classifyFile, extensionOf, formatExposure, megapixels } from './index';

describe('imageFormat', () => {
  it('classifies RAW, bitmap and unsupported files', () => {
    expect(classifyFile('IMG_0001.CR2')).toBe('raw');
    expect(classifyFile('a.b.NEF')).toBe('raw');
    expect(classifyFile('x.3FR')).toBe('raw');
    expect(classifyFile('photo.JPG')).toBe('bitmap');
    expect(classifyFile('notes.txt')).toBeNull();
    expect(classifyFile('noext')).toBeNull();
    expect(extensionOf('/a/b/c.Dng')).toBe('dng');
  });
});

describe('exif helpers', () => {
  it('formats exposure times', () => {
    expect(formatExposure(1 / 45)).toBe('1/45 s');
    expect(formatExposure(1 / 8000)).toBe('1/8000 s');
    expect(formatExposure(0.5)).toBe('0.5 s');
    expect(formatExposure(2)).toBe('2 s');
    expect(formatExposure(0)).toBeUndefined();
    expect(formatExposure(undefined)).toBeUndefined();
  });
  it('computes megapixels', () => {
    expect(megapixels({ width: 6000, height: 4000 })).toBe(24);
  });
});
