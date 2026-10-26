import {
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const MIME_EXTENSION = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
});

const SECTION_IMAGE_FIELDS = Object.freeze({
  config: ['logo', 'banner'],
  visual: ['heroFloatingImage'],
  products: ['image'],
  combos: ['image'],
  promotions: ['image'],
  announcements: ['image'],
});

function clone(value) {
  if (value == null) return value;
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function decodeDataImage(rawValue) {
  const raw = String(rawValue || '').trim();
  const match = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;

  const mimeType = String(match[1] || '').toLowerCase() === 'image/jpg'
    ? 'image/jpeg'
    : String(match[1] || '').toLowerCase();
  const extension = MIME_EXTENSION[mimeType];
  if (!extension) throw new Error(`Tipo de imagem nao suportado: ${mimeType || 'desconhecido'}.`);

  const encoded = String(match[2] || '').replace(/\s+/g, '');
  if (!encoded) throw new Error('Imagem em base64 vazia.');
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length) throw new Error('Imagem em base64 vazia.');

  const inputCanonical = encoded.replace(/=+$/g, '');
  const outputCanonical = buffer.toString('base64').replace(/=+$/g, '');
  if (inputCanonical !== outputCanonical) throw new Error('Imagem em base64 invalida.');

  return { mimeType, extension, buffer };
}

export function persistCatalogDataImage(rawValue, {
  assetsDir,
  publicPrefix = '/assets/catalog',
} = {}) {
  const decoded = decodeDataImage(rawValue);
  if (!decoded) return { value: String(rawValue || '').trim(), materialized: false, filePath: '' };
  if (!assetsDir) throw new Error('Diretorio do catalogo nao informado.');

  const digest = createHash('sha256').update(decoded.buffer).digest('hex');
  const filename = `${digest}.${decoded.extension}`;
  const targetDir = path.resolve(assetsDir);
  const filePath = path.join(targetDir, filename);
  mkdirSync(targetDir, { recursive: true });

  if (!existsSync(filePath)) {
    const tempPath = `${filePath}.${process.pid}-${randomUUID()}.filepart`;
    try {
      writeFileSync(tempPath, decoded.buffer, { flag: 'wx' });
      try {
        renameSync(tempPath, filePath);
      } catch (error) {
        if (!existsSync(filePath)) throw error;
        unlinkSync(tempPath);
      }
    } catch (error) {
      try {
        if (existsSync(tempPath)) unlinkSync(tempPath);
      } catch {
        // O arquivo temporario e descartavel.
      }
      throw error;
    }
  }

  return {
    value: `${String(publicPrefix || '/assets/catalog').replace(/\/+$/, '')}/${filename}`,
    materialized: true,
    filePath,
    bytes: decoded.buffer.length,
  };
}

function materializeObjectFields(value, fields, options, changes, identity = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  for (const field of fields) {
    if (typeof value[field] !== 'string' || !value[field].trim().startsWith('data:image/')) continue;
    const beforeLength = value[field].length;
    const result = persistCatalogDataImage(value[field], options);
    if (!result.materialized) continue;
    value[field] = result.value;
    changes.push({
      identity,
      field,
      beforeLength,
      after: result.value,
      bytes: result.bytes,
      filePath: result.filePath,
    });
  }
  return value;
}

export function materializeSectionAssets(section, rawValue, options = {}) {
  const value = clone(rawValue);
  const fields = SECTION_IMAGE_FIELDS[section] || [];
  const changes = [];
  if (fields.length === 0) return { value, changes };

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      materializeObjectFields(
        entry,
        fields,
        options,
        changes,
        String(entry?.id || entry?.name || index),
      );
    });
  } else {
    materializeObjectFields(value, fields, options, changes, section);
  }

  return { value, changes };
}

export function materializeStateAssets(rawState, options = {}) {
  const state = clone(rawState && typeof rawState === 'object' ? rawState : {});
  const changes = [];
  for (const section of Object.keys(SECTION_IMAGE_FIELDS)) {
    if (!Object.hasOwn(state, section)) continue;
    const result = materializeSectionAssets(section, state[section], options);
    state[section] = result.value;
    for (const change of result.changes) changes.push({ section, ...change });
  }
  return { state, changes };
}
