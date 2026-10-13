/**
 * HeartViewer.jsx  (React + Vite, @react-three/fiber, @react-three/drei, three, Tailwind)
 *
 * Realism: procedural tissue shader (mottling, fat, capillaries, micro-bump, wet gloss, soft
 * subsurface look) + soft studio lighting. No textures or UVs needed.
 *
 * What the risk colours mean (same scale everywhere: pins, vessels, status label, glow behind the heart)
 *   green   under 30%      yellow  30 to 50%      orange  50 to 75%      red  75% and above
 *
 * Features:
 *   1. Light / dark theme.
 *   2. Darker heart muscle with risk: the wall around each high-risk vessel darkens (territory shading),
 *      and the whole muscle dims a little with overall severity.
 *   3. Labels: clickable pins on LAD / LCX / RCA, aorta, pulmonary artery, SVC. Vessel pins show the
 *      predicted percentage and are coloured by it.
 *   4. Selection and focus: the camera turns to a selected part or pin.
 *   5. Optional heartbeat.
 *
 * Props
 *   vesselRisk        stenosis probabilities. Any of these shapes works:
 *                       { LAD: 0.95, LCX: 0.85, RCA: 0.95 }   { lad: '95%', ... }   { LAD: { risk_score: 0.95 } }
 *                       [{ id: 'LAD', probability: 95 }, ...]
 *   overallProb       overall CAD probability (0-1 or 0-100). Optional.
 *   riskLevel         'Normal' | 'Borderline' | 'High' | 'Critical' (or 0-3). Optional: the level shown is the
 *                     HIGHER of this and the level the numbers imply, so a stale "Normal" can never hide a 95% risk.
 *   severity          0-1 overall dimming of the muscle. Defaults to the highest risk given.
 *   theme             'dark' | 'light' (default 'dark')
 *   syncKey           give two viewers the same string and their cameras move together
 *                     (rotate, zoom, pan, view buttons and auto-rotate all stay in lockstep)
 *   externalRef       ref (object or function) that receives the OrbitControls instance
 *   onControlsChange  called on every OrbitControls change event
 *   overallRisk       alias of riskLevel;  vesselProbs  alias of vesselRisk
 *   selectedPart, onPartSelect, onPartsLoaded, partRegistry
 *   showLabels, showStatus, focusOnSelect, fastPicking
 *   educational       teaching mode: natural colours, no percentages, no built-in detail card
 *   paused            stop rendering while scrolled out of sight
 *   pulse, bpm        heartbeat animation (default off) and a pulse rate to show
 *   manifestUrl, modelUrl, modelRotation, tissueShader, defaultAutoRotate, showDisclaimer, className
 */
import React, {
  Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  AdaptiveDpr, Bvh, Environment, Lightformer, OrbitControls, useGLTF, useProgress,
} from '@react-three/drei';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

/* ------------------------------------------------------------------ */
/* Helpers and design tokens                                           */
/* ------------------------------------------------------------------ */
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (cur, tgt, k) => cur + (tgt - cur) * k;
const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

export const THEMES = {
  dark: {
    id: 'dark',
    bg: '#0f1417',
    lift: '#1b2428',
    card: '#1b2428',
    ink: '#ece5da',
    mute: '#9aa6ab',
    pick: '#9bd6ff',
    accent: '#ef4444',
    border: 'rgba(255, 255, 255, 0.1)',
    gradient: 'radial-gradient(70% 60% at 50% 45%, #1b2428 0%, #0f1417 72%)',
    panelCss: 'rounded-lg bg-[#0f1417]/80 px-3 py-2 text-xs text-[#ece5da] ring-1 ring-white/10 backdrop-blur-sm shadow-md',
    btnCss: 'pointer-events-auto rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-[#ece5da] ring-1 ring-white/10 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ece5da]',
    btnActiveCss: 'bg-white/25 ring-white/30 text-white font-medium',
    pinCss: 'bg-[#0f1417]/90 text-[#ece5da] shadow-md',
    envIntensity: 1.0,
  },
  light: {
    id: 'light',
    bg: '#f8fafc',
    lift: '#ffffff',
    card: '#ffffff',
    ink: '#0f172a',
    mute: '#64748b',
    pick: '#0284c7',
    accent: '#dc2626',
    border: 'rgba(0, 0, 0, 0.1)',
    gradient: 'radial-gradient(70% 60% at 50% 45%, #ffffff 0%, #e2e8f0 72%)',
    panelCss: 'rounded-lg bg-white/85 px-3 py-2 text-xs text-[#0f172a] ring-1 ring-slate-900/10 backdrop-blur-sm shadow-sm',
    btnCss: 'pointer-events-auto rounded-md bg-slate-900/5 px-2.5 py-1.5 text-xs text-[#0f172a] ring-1 ring-slate-900/10 transition hover:bg-slate-900/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f172a]',
    btnActiveCss: 'bg-slate-900/15 ring-slate-900/20 text-slate-900 font-medium',
    pinCss: 'bg-white/90 text-[#0f172a] shadow-sm',
    envIntensity: 1.2,
  },
};
export const UI = THEMES.dark; // default reference

// One four-colour scale used everywhere. Every field is read by the animation code: a missing one
// turns colours into NaN and the heart renders black, so keep all fields on every level.
export const RISK = {
  Normal:     { color: '#22c55e', bpm: 72,  label: 'Normal',     short: 'Normal',     amp: 0.022, glow: 0.10, tint: 0.05, note: 'Resting rhythm',    sev: 0.0 },
  Borderline: { color: '#facc15', bpm: 85,  label: 'Borderline', short: 'Borderline', amp: 0.032, glow: 0.22, tint: 0.09, note: 'Elevated rate',     sev: 0.4 },
  High:       { color: '#f97316', bpm: 105, label: 'High Risk',  short: 'High',       amp: 0.045, glow: 0.40, tint: 0.14, note: 'Tachycardic pulse', sev: 0.7 },
  Critical:   { color: '#ef4444', bpm: 120, label: 'Critical',   short: 'Critical',   amp: 0.050, glow: 0.50, tint: 0.17, note: 'Tachycardic pulse', sev: 0.9 },
};
RISK[0] = RISK.Normal; RISK[1] = RISK.Borderline; RISK[2] = RISK.High; RISK[3] = RISK.Critical;
const RISK_ORDER = ['Normal', 'Borderline', 'High', 'Critical'];

// Accepts 'High', 'high risk', 2, '2' ... and always returns a complete level object
export function getRisk(level) {
  if (typeof level === 'number' || /^\d$/.test(String(level))) {
    return RISK[RISK_ORDER[clamp(Math.round(Number(level)), 0, 3)]];
  }
  const s = String(level ?? '').toLowerCase();
  if (s.startsWith('crit') || s.startsWith('sever')) return RISK.Critical;
  if (s.startsWith('high')) return RISK.High;
  if (s.startsWith('border') || s.startsWith('med') || s.startsWith('mod')) return RISK.Borderline;
  return RISK.Normal;
}

// Reads one probability from a number, '95%', '0.95', or { risk_score | probability | prob | risk | score | value }
const PROB_KEYS = ['risk_score', 'riskScore', 'probability', 'prob', 'risk', 'score', 'value', 'p'];
export function readProb(raw) {
  if (raw === null || raw === undefined || raw === '') return undefined;
  if (typeof raw === 'object') {
    for (const k of PROB_KEYS) {
      const r = readProb(raw[k]);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  const isPct = typeof raw === 'string' && raw.includes('%');
  const n = typeof raw === 'string' ? parseFloat(raw.replace('%', '')) : Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return clamp(isPct || n > 1 ? n / 100 : n, 0, 1);
}

export function riskLevelFromProb(p) {
  const v = readProb(p);
  if (v === undefined) return 'Normal';
  if (v < 0.30) return 'Normal';
  if (v < 0.50) return 'Borderline';
  if (v < 0.75) return 'High';
  return 'Critical';
}

// Probability -> colour: green, yellow, orange, red. The stops sit at the middle of each band above.
const RISK_AT = [0.10, 0.40, 0.62, 0.85];
export const RISK_STOPS = ['#22c55e', '#facc15', '#f97316', '#ef4444'].map((c) => new THREE.Color(c));
export function riskColorAt(p, out) {
  const v = clamp(p, 0, 1);
  if (v <= RISK_AT[0]) return out.copy(RISK_STOPS[0]);
  for (let i = 1; i < RISK_AT.length; i++) {
    if (v <= RISK_AT[i]) {
      return out.copy(RISK_STOPS[i - 1]).lerp(RISK_STOPS[i], (v - RISK_AT[i - 1]) / (RISK_AT[i] - RISK_AT[i - 1]));
    }
  }
  return out.copy(RISK_STOPS[RISK_STOPS.length - 1]);
}
export const riskHex = (p) => `#${riskColorAt(clamp(p, 0, 1), new THREE.Color()).getHexString()}`;

// Tailwind class helper for badges elsewhere on your page
export function riskCss(risk) {
  const level = getRisk(risk).short;
  if (risk === undefined || risk === null) return 'text-emerald-400 bg-emerald-950/50 border-emerald-500/30';
  if (level === 'Critical') return 'text-red-400 bg-red-950/50 border-red-500/30';
  if (level === 'High') return 'text-orange-400 bg-orange-950/50 border-orange-500/30';
  if (level === 'Borderline') return 'text-yellow-300 bg-yellow-950/40 border-yellow-500/30';
  return 'text-emerald-400 bg-emerald-950/50 border-emerald-500/30';
}

// Vessel values at or below this many percent are treated as "no stenosis" and shown as 0%.
// Set to 0 to show the raw value exactly as received.
export const ZERO_BELOW_PCT = 5;
const snapLow = (p) => (p !== undefined && Math.round(p * 100) <= ZERO_BELOW_PCT ? 0 : p);

// One vessel's probability (0-1) from whatever shape the data arrives in; undefined when not found
export function vesselProb(vr, vessel) {
  if (!vr || !vessel) return undefined;
  const want = vessel.toLowerCase();
  if (Array.isArray(vr)) {
    const hit = vr.find((item) => item && [item.id, item.name, item.vessel, item.label, item.key]
      .some((x) => typeof x === 'string' && x.toLowerCase() === want));
    return snapLow(readProb(hit));
  }
  if (typeof vr !== 'object') return undefined;
  let raw = vr[vessel] ?? vr[want];
  if (raw === undefined) {
    const token = new RegExp(`(^|[^a-z])${want}([^a-z]|$)`);
    const key = Object.keys(vr).find((k) => token.test(k.toLowerCase()));
    if (key !== undefined) raw = vr[key];
  }
  return snapLow(readProb(raw));
}

// Finds the vessel probabilities, the overall probability and a risk level inside an API result.
// Used by DualHeartViewer, but handy anywhere you have the raw response.
export function extractRisk(data) {
  const none = { vesselRisk: undefined, overall: undefined, level: 'Normal', found: false, keys: [] };
  if (!data || typeof data !== 'object') return none;

  let vesselRisk;
  const places = [data.vesselProbs, data.vesselRisk, data.vessel_probs, data.vessel_risk, data.vesselRisks,
    data.vessels, data.stenosis, data.predictions, data];
  for (const src of places) {
    if (!src || typeof src !== 'object') continue;
    const found = {};
    VESSELS.forEach((v) => { const p = vesselProb(src, v); if (p !== undefined) found[v] = p; });
    if (Object.keys(found).length) { vesselRisk = found; break; }
  }

  const overallCandidates = [data.overallCadProb, data.overall_cad_prob, data.cadProb, data.overallProb,
    data.overall, data.predictions?.cad, data.predictions?.CAD, data.overallRisk, data.riskScore];
  let overall;
  for (const c of overallCandidates) {
    const p = readProb(c);
    if (p !== undefined) { overall = p; break; }
  }
  const worst = vesselRisk ? Math.max(...Object.values(vesselRisk)) : undefined;
  const prob = overall ?? worst;

  let level = prob === undefined ? 'Normal' : riskLevelFromProb(prob);
  for (const s of [data.riskLevel, data.overallRisk]) {
    if (typeof s === 'string' && !Number.isFinite(parseFloat(s))) {
      const named = getRisk(s).short;
      if (RISK_ORDER.indexOf(named) > RISK_ORDER.indexOf(level)) level = named;
    }
  }
  return { vesselRisk, overall: prob, level, found: !!vesselRisk, keys: Object.keys(data) };
}

// Tissue palette: natural anatomical colours with procedural light/dark territory shading
const FAT_COLOR = '#dcc487';
const RIM_BASE = '#d8604a';
const SSS_TINT = '#ff6a4d';
const DARK_TINT = new THREE.Color().setRGB(0.32, 0.30, 0.36);
const GLOBAL_DARK = new THREE.Color().setRGB(0.55, 0.47, 0.55);

const KINDS = {
  muscle:     { color: '#a65a4f', rough: 0.62, clear: 0.30, cc: 0.32, sheen: 0.55, fat: 0.55, cap: 0.30, bump: 2.0, freq: 2.0, sss: 0.9, rim: 0.35, tintK: 1.0, glowK: 0.15 },
  artery:     { color: '#b9514a', rough: 0.55, clear: 0.40, cc: 0.28, sheen: 0.40, fat: 0.0,  cap: 0.0,  bump: 0.8, freq: 2.5, sss: 0.6, rim: 0.25, tintK: 0.3, glowK: 0.10 },
  vein:       { color: '#6a62a0', rough: 0.55, clear: 0.40, cc: 0.28, sheen: 0.40, fat: 0.0,  cap: 0.0,  bump: 0.8, freq: 2.5, sss: 0.5, rim: 0.25, tintK: 0.2, glowK: 0.05 },
  coronary:   { color: '#d2473c', rough: 0.45, clear: 0.55, cc: 0.22, sheen: 0.30, fat: 0.0,  cap: 0.0,  bump: 0.4, freq: 3.0, sss: 0.5, rim: 0.30, tintK: 1.8, glowK: 2.2 },
  conduction: { color: '#e0a63c', rough: 0.60, clear: 0.30, cc: 0.30, sheen: 0.20, fat: 0.0,  cap: 0.0,  bump: 0.4, freq: 3.0, sss: 0.3, rim: 0.15, tintK: 0.1, glowK: 0.05 },
  fat:        { color: '#dcc088', rough: 0.80, clear: 0.12, cc: 0.45, sheen: 0.30, fat: 0.0,  cap: 0.0,  bump: 1.2, freq: 2.5, sss: 0.7, rim: 0.20, tintK: 0.1, glowK: 0.0 },
};
export const VESSELS = ['LAD', 'LCX', 'RCA'];
VESSELS.forEach((v) => { KINDS[v] = KINDS.coronary; });

const RIG = {
  key:  { pos: [3, 4, 5],        color: '#ffe9dc', intensity: 2.4 },
  fill: { pos: [-4, -1, 3],      color: '#c9d7ff', intensity: 0.45 },
  rimA: { pos: [-3, 2.5, -5],    color: '#9fd4ff', intensity: 1.5 },
  rimB: { pos: [3.5, 1.5, -4.5], color: '#ffb9a0', intensity: 1.1 },
};

const FIT_RADIUS = 1.5;
const CAM_DIST = 4.6;
export const VIEWS = {
  anterior:  { label: 'Anterior',      dir: [0, 0.05, 1] },
  posterior: { label: 'Posterior',     dir: [0, 0.05, -1] },
  left:      { label: 'Left lateral',  dir: [1, 0.05, 0] },
  right:     { label: 'Right lateral', dir: [-1, 0.05, 0] },
  superior:  { label: 'Superior',      dir: [0, 1, 0.08] },
};
const VIEW_DIRS = Object.fromEntries(
  Object.entries(VIEWS).map(([id, v]) => [id, new THREE.Vector3(...v.dir).normalize()]),
);

/* ------------------------------------------------------------------ */
/* Part registry                                                       */
/* ------------------------------------------------------------------ */
export const DEFAULT_REGISTRY = [
  { re: /coronary sinus/, id: 'CS', label: 'Coronary sinus', kind: 'vein' },
  { re: /superior vena cava|(^| )svc( |$)/, id: 'SVC', label: 'Superior vena cava', kind: 'vein', anchor: true },
  { re: /inferior vena cava|(^| )ivc( |$)/, id: 'IVC', label: 'Inferior vena cava', kind: 'vein' },
  { re: /pulmonary vein/, id: 'PV', label: 'Pulmonary veins', kind: 'vein' },
  { re: /vein|venous|venae|sinus/, kind: 'vein' },
  { re: /anterior interventricular (branch|artery)|descending (branch|artery)|(^| )lad( |$)/, id: 'LAD', label: 'Left anterior descending artery', kind: 'coronary', vessel: 'LAD', anchor: true },
  { re: /circumflex|(^| )lcx( |$)/, id: 'LCX', label: 'Left circumflex artery', kind: 'coronary', vessel: 'LCX', anchor: true },
  { re: /right coronary|(^| )rca( |$)/, id: 'RCA', label: 'Right coronary artery', kind: 'coronary', vessel: 'RCA', anchor: true },
  { re: /left coronary/, id: 'LM', label: 'Left main coronary artery', kind: 'coronary' },
  { re: /coronary|marginal|diagonal/, kind: 'coronary' },
  { re: /pulmonary (trunk|artery)/, id: 'PA', label: 'Pulmonary artery', kind: 'artery', anchor: true },
  { re: /aort/, id: 'AO', label: 'Aorta', kind: 'artery', anchor: true },
  { re: /arter|trunk|vessel/, kind: 'artery' },
  { re: /node|bundle|purkinje/, kind: 'conduction' },
  { re: /fat|adipose|sulcus/, kind: 'fat' },
];
const NO_REGISTRY = [];
const EDU_RISK = { LAD: 0, LCX: 0, RCA: 0 }; // 'educational' mode: every vessel at 0% = natural colours

const CODE_PREFIX = /^(?:[a-z]{1,4}\d+[_\-\s]+)+/i;
const cleanName = (s) => {
  const noExt = s.replace(/\.(obj|glb|gltf|stl|ply)$/i, '');
  const tidy = (x) => x.replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  return tidy(noExt.replace(CODE_PREFIX, '')) || tidy(noExt);
};
const prettify = (s) => {
  const t = cleanName(s);
  return t ? t[0].toUpperCase() + t.slice(1) : s;
};

export function resolvePart(rawName = '', registry = DEFAULT_REGISTRY) {
  const base = rawName.split(':')[0];
  const n = cleanName(base).toLowerCase();
  const hit = registry.find((r) => r.re.test(n));
  return {
    id: hit?.id ?? base,
    label: hit?.label ?? prettify(base),
    kind: hit?.kind ?? 'muscle',
    vessel: hit?.vessel ?? null,
    anchor: !!hit?.anchor,
  };
}

/* ------------------------------------------------------------------ */
/* Tissue shader with light and dark territory risk controls           */
/* ------------------------------------------------------------------ */
const VERT_PARS = 'attribute vec3 aTissueP;\nattribute vec3 aTerr;\nuniform vec3 uVRisk;\nvarying vec3 vTissueP;\nvarying float vDamage;';

const FRAG_PARS = /* glsl */ `
varying vec3 vTissueP;
varying float vDamage;
uniform vec3 uDarkTint;
uniform float uFreq;
uniform float uFat;
uniform float uCap;
uniform float uBump;
uniform float uWrap;
uniform float uSssStrength;
uniform float uRim;
uniform vec3 uFatColor;
uniform vec3 uSssTint;
uniform vec3 uRimColor;
uniform vec3 uKeyL;
uniform vec3 uKeyC;

float ht_hash(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float ht_noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(ht_hash(i), ht_hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(ht_hash(i + vec3(0.0, 1.0, 0.0)), ht_hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(ht_hash(i + vec3(0.0, 0.0, 1.0)), ht_hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(ht_hash(i + vec3(0.0, 1.0, 1.0)), ht_hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float ht_fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * ht_noise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s / 0.875;
}
float ht_ct(float x) { return smoothstep(0.25, 0.75, x); }
`;

const FRAG_HOOKS = [
  ['#include <color_fragment>', /* glsl */ `
float ht_n1 = ht_fbm(vTissueP * uFreq);
float ht_n2 = ht_fbm(vTissueP * uFreq * 3.7 + 11.3);
float ht_n3 = ht_fbm(vTissueP * uFreq * 0.8 + 41.7);
float ht_n4 = ht_fbm(vTissueP * uFreq * 2.3 + 73.9);
diffuseColor.rgb *= mix(0.78, 1.18, ht_ct(ht_n1));
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 0.88, 0.84), ht_ct(ht_n2) * 0.65);
float ht_fat = smoothstep(0.58, 0.70, ht_n3) * uFat;
float ht_line = (1.0 - smoothstep(0.0, 0.03, abs(ht_n4 - 0.5))) * uCap * (1.0 - ht_fat);
diffuseColor.rgb = mix(diffuseColor.rgb, uFatColor, ht_fat * 0.85);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.38, 0.42), ht_line);
diffuseColor.rgb *= mix(vec3(1.0), uDarkTint, smoothstep(0.08, 0.9, vDamage));
`],
  ['#include <roughnessmap_fragment>', /* glsl */ `
roughnessFactor = clamp(roughnessFactor * mix(0.8, 1.2, ht_ct(ht_n2)) + ht_fat * 0.25, 0.18, 1.0);
`],
  ['#include <normal_fragment_maps>', /* glsl */ `
float ht_hgt = ht_n2 * 0.6 + ht_fbm(vTissueP * uFreq * 12.0 + 5.1) * 0.4 - ht_line * 0.5 - ht_fat * 0.15;
vec2 ht_dH = clamp(vec2(dFdx(ht_hgt), dFdy(ht_hgt)) * uBump, vec2(-0.1), vec2(0.1));
vec3 ht_sx = normalize(dFdx(-vViewPosition));
vec3 ht_sy = normalize(dFdy(-vViewPosition));
vec3 ht_r1 = cross(ht_sy, normal);
vec3 ht_r2 = cross(normal, ht_sx);
float ht_det = dot(ht_sx, ht_r1) * faceDirection;
vec3 ht_grad = sign(ht_det) * (ht_dH.x * ht_r1 + ht_dH.y * ht_r2);
normal = normalize(abs(ht_det) * normal - ht_grad);
`],
  ['#include <emissivemap_fragment>', /* glsl */ `
totalEmissiveRadiance += uRimColor * uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5);
`],
  ['#include <lights_physical_fragment>', /* glsl */ `
#ifdef USE_CLEARCOAT
material.clearcoat = saturate(material.clearcoat * (1.0 - ht_fat * 0.8) * mix(0.55, 1.25, ht_ct(ht_n3)));
material.clearcoatRoughness = clamp(material.clearcoatRoughness * mix(0.7, 1.8, ht_ct(ht_n2)), 0.06, 1.0);
#endif
`],
  ['#include <lights_fragment_end>', /* glsl */ `
{
  float ht_ndl = dot(normal, uKeyL);
  float ht_w = saturate((ht_ndl + uWrap) / (1.0 + uWrap)) - saturate(ht_ndl);
  reflectedLight.directDiffuse += uSssTint * uKeyC * diffuseColor.rgb * (ht_w * uSssStrength * RECIPROCAL_PI);
}
`],
];

function makeTissueMaterial(kind, procedural) {
  const k = KINDS[kind];
  const mat = new THREE.MeshPhysicalMaterial({
    color: k.color,
    roughness: k.rough,
    metalness: 0,
    clearcoat: k.clear,
    clearcoatRoughness: k.cc,
    sheen: k.sheen,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#ffb4a2'),
    emissive: new THREE.Color('#000000'),
    emissiveIntensity: 0,
    envMapIntensity: 0.7,
    side: THREE.DoubleSide,
  });
  const u = {
    uFreq: { value: k.freq },
    uFat: { value: k.fat },
    uCap: { value: k.cap },
    uBump: { value: k.bump },
    uWrap: { value: 0.5 },
    uSssStrength: { value: k.sss },
    uRim: { value: k.rim },
    uFatColor: { value: new THREE.Color(FAT_COLOR) },
    uSssTint: { value: new THREE.Color(SSS_TINT) },
    uRimColor: { value: new THREE.Color(RIM_BASE) },
    uKeyL: { value: new THREE.Vector3(...RIG.key.pos).normalize() },
    uKeyC: { value: new THREE.Color(RIG.key.color).multiplyScalar(RIG.key.intensity) },
    uVRisk: { value: new THREE.Vector3() },
    uDarkTint: { value: DARK_TINT.clone() },
  };
  mat.userData.u = u;
  if (procedural) {
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTissueP = aTissueP;\nvDamage = dot(aTerr, uVRisk);');
      let f = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FRAG_PARS}`);
      FRAG_HOOKS.forEach(([token, code]) => { f = f.replace(token, `${token}\n${code}`); });
      shader.fragmentShader = f;
    };
    mat.customProgramCacheKey = () => 'heart-tissue-v2';
  }
  return mat;
}

function useTissue(procedural) {
  const mats = useMemo(
    () => Object.fromEntries(Object.keys(KINDS).map((k) => [k, makeTissueMaterial(k, procedural)])),
    [procedural],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return mats;
}

const overlayMat = (color, opacity) => new THREE.MeshBasicMaterial({
  color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false,
});
const HOVER_MAT = overlayMat('#ffffff', 0.2);

/* ------------------------------------------------------------------ */
/* Heartbeat + tissue risk darkening                                   */
/* ------------------------------------------------------------------ */
const lobe = (p, c, attack, decay) => {
  const s = p < c ? attack : decay;
  return Math.exp(-((p - c) ** 2) / (2 * s * s));
};
const beat = (p) => lobe(p, 0.09, 0.025, 0.06) + 0.5 * lobe(p, 0.38, 0.03, 0.06);

const RIM_COLOR = new THREE.Color(RIM_BASE);
const WHITE = new THREE.Color(1, 1, 1);
const _tmpC = new THREE.Color();

function useHeartbeat({ beatRef, mats, riskLevel, bpm, calm, pulse, vesselRisk, severity }) {
  const cfg = getRisk(riskLevel);
  const target = useMemo(() => new THREE.Color(cfg.color), [cfg.color]);
  const base = useMemo(
    () => Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, new THREE.Color(v.color)])),
    [],
  );
  const vesselCol = useMemo(() => Object.fromEntries(VESSELS.map((v) => [v, new THREE.Color(RISK_STOPS[0])])), []);
  const vTarget = useMemo(() => new THREE.Color(), []);
  const vrTarget = useMemo(() => new THREE.Vector3(), []);
  const st = useRef(null);
  if (!st.current) {
    st.current = {
      phase: 0, bpm: num(bpm, cfg.bpm), amp: cfg.amp, glow: cfg.glow, tint: cfg.tint,
      sev: 0, vr: new THREE.Vector3(), color: target.clone(),
    };
  }

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const k = 1 - Math.exp(-3 * dt);
    const s = st.current;
    s.bpm = damp(s.bpm, clamp(num(bpm, cfg.bpm), 40, 200), k);
    s.amp = damp(s.amp, cfg.amp * (calm ? 0.35 : 1), k);
    s.glow = damp(s.glow, cfg.glow, k);
    s.tint = damp(s.tint, cfg.tint, k);
    s.sev = damp(s.sev, clamp(num(severity, cfg.sev), 0, 1), k);
    s.color.lerp(target, k);
    // The three vessel probabilities drive the territory darkening in the shader
    vrTarget.set(vesselProb(vesselRisk, 'LAD') ?? 0, vesselProb(vesselRisk, 'LCX') ?? 0, vesselProb(vesselRisk, 'RCA') ?? 0);
    s.vr.lerp(vrTarget, k);

    let b = 0.5;
    if (pulse) {
      s.phase = (s.phase + (dt * s.bpm) / 60) % 1;
      b = beat(s.phase);
      beatRef.current?.scale.set(1 + s.amp * b, 1 + s.amp * 0.6 * b, 1 + s.amp * b);
    } else {
      beatRef.current?.scale.set(1, 1, 1);
    }

    for (const [kind, m] of Object.entries(mats)) {
      const c = KINDS[kind];
      const p = VESSELS.includes(kind) ? vesselProb(vesselRisk, kind) : undefined;
      if (p != null) {
        // A vessel with a prediction: natural at low risk, fading to green / yellow / orange / red as risk rises
        riskColorAt(p, vTarget);
        vesselCol[kind].lerp(vTarget, k);
        const a = clamp((p - 0.12) / 0.33, 0, 1);
        const fade = a * a * (3 - 2 * a);
        m.color.copy(base[kind]).lerp(vesselCol[kind], 0.7 * fade);
        m.emissive.copy(vesselCol[kind]);
        m.emissiveIntensity = (0.3 + 0.7 * p) * (0.7 + 0.3 * b) * fade;
      } else if (kind === 'muscle') {
        // Whole-muscle dimming with overall severity (the territory darkening is added in the shader)
        _tmpC.copy(WHITE).lerp(GLOBAL_DARK, s.sev * 0.6);
        m.color.copy(base[kind]).multiply(_tmpC);
        m.emissive.copy(s.color);
        m.emissiveIntensity = s.glow * c.glowK * (0.45 + 0.55 * b);
      } else {
        m.color.copy(base[kind]).lerp(s.color, Math.min(1, s.tint * c.tintK));
        m.emissive.copy(s.color);
        m.emissiveIntensity = s.glow * c.glowK * (0.45 + 0.55 * b);
      }
      const u = m.userData.u;
      if (u) {
        u.uVRisk.value.copy(s.vr);
        u.uRimColor.value.copy(RIM_COLOR).lerp(s.color, 0.3);
        u.uRim.value = c.rim * (0.85 + 0.4 * b) * (1 + 0.5 * s.sev);
      }
    }
  });
}

function BeatingHeart({ riskLevel, bpm, calm, pulse, vesselRisk, severity, procedural, modelRotation, children }) {
  const mats = useTissue(procedural);
  const beatRef = useRef();
  useHeartbeat({ beatRef, mats, riskLevel, bpm, calm, pulse, vesselRisk, severity });
  return (
    <group ref={beatRef}>
      <group rotation={modelRotation}>{children(mats)}</group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Pin tracker: the tags are DOM buttons; this only moves them         */
/* ------------------------------------------------------------------ */
const _wp = new THREE.Vector3();
const _cd = new THREE.Vector3();

function PinTracker({ anchors, groupRef, pinRefs }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  useFrame(() => {
    const g = groupRef.current;
    if (!g || !anchors.length) return;
    g.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    _cd.copy(camera.position).normalize();
    for (const a of anchors) {
      const el = pinRefs.current.get(a.info.id);
      if (!el) continue;
      _wp.copy(a.center);
      g.localToWorld(_wp);
      const front = _wp.dot(_cd) > -0.1;
      _wp.project(camera);
      const x = (_wp.x * 0.5 + 0.5) * size.width;
      const y = (-_wp.y * 0.5 + 0.5) * size.height;
      const show = front && _wp.z < 1;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      el.style.opacity = show ? '1' : '0.15';
      el.style.pointerEvents = show ? 'auto' : 'none';
    }
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Territory calculations and model fitting                            */
/* ------------------------------------------------------------------ */
const T_REACH2 = 0.95 * 0.95;
const T_SOFT2 = 0.55 * 0.55;
function bakeTerritory(tp, lists) {
  const n = tp.length / 3;
  const out = new Float32Array(n * 3);
  const d2 = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const x = tp[i * 3];
    const y = tp[i * 3 + 1];
    const z = tp[i * 3 + 2];
    let dmin = Infinity;
    for (let vi = 0; vi < 3; vi++) {
      const arr = lists[vi];
      let best = 1e9;
      for (let j = 0; j < arr.length; j += 3) {
        const dx = x - arr[j];
        const dy = y - arr[j + 1];
        const dz = z - arr[j + 2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < best) best = d;
      }
      d2[vi] = best;
      if (best < dmin) dmin = best;
    }
    const cover = Math.exp(-dmin / T_REACH2);
    const e0 = Math.exp(-(d2[0] - dmin) / T_SOFT2);
    const e1 = Math.exp(-(d2[1] - dmin) / T_SOFT2);
    const e2 = Math.exp(-(d2[2] - dmin) / T_SOFT2);
    const sum = e0 + e1 + e2;
    out[i * 3] = (cover * e0) / sum;
    out[i * 3 + 1] = (cover * e1) / sum;
    out[i * 3 + 2] = (cover * e2) / sum;
  }
  return out;
}

function FittedModel({ object, mats, partApi, pickColor }) {
  const {
    registry, onHover, onSelect, onFocus, onReady, hoveredId, selectedId,
    pinRefs, fastPicking, focusOnSelect,
  } = partApi;
  const groupRef = useRef();

  const pickMat = useMemo(() => overlayMat(pickColor ?? UI.pick, 0.38), [pickColor]);

  const model = useMemo(() => {
    object.updateMatrixWorld(true);
    const sphere = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere());
    const s = FIT_RADIUS / Math.max(sphere.radius, 1e-6);
    const v = new THREE.Vector3();
    const byPart = new Map();

    object.traverse((o) => {
      if (!o.isMesh) return;
      const info = resolvePart(o.name, registry);
      o.userData.part = info;
      o.material = mats[info.vessel ?? info.kind] ?? mats.muscle;
      if (!byPart.has(info.id)) byPart.set(info.id, { info, meshes: [] });
      byPart.get(info.id).meshes.push(o);

      const g = o.geometry;
      if (!g.attributes.normal) g.computeVertexNormals();
      if (g.attributes.aTissueP) return;
      const pos = g.attributes.position;
      const arr = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).sub(sphere.center).multiplyScalar(s);
        arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
      }
      g.setAttribute('aTissueP', new THREE.BufferAttribute(arr, 3));
    });

    // Sample points along each coronary vessel, then give every muscle vertex a weight per vessel
    const samples = { LAD: [], LCX: [], RCA: [] };
    byPart.forEach(({ info, meshes }) => {
      if (!samples[info.vessel]) return;
      meshes.forEach((m) => {
        const a = m.geometry.attributes.aTissueP;
        const step = Math.max(1, Math.floor(a.count / 40));
        for (let i = 0; i < a.count; i += step) samples[info.vessel].push(a.array[i * 3], a.array[i * 3 + 1], a.array[i * 3 + 2]);
      });
    });
    const lists = VESSELS.map((name) => samples[name]);
    if (lists.some((l) => l.length)) {
      object.traverse((o) => {
        if (!o.isMesh || o.geometry.attributes.aTerr) return;
        const kind = o.userData.part.kind;
        const tp = o.geometry.attributes.aTissueP.array;
        const w = (kind === 'muscle' || kind === 'fat') ? bakeTerritory(tp, lists) : new Float32Array(tp.length);
        o.geometry.setAttribute('aTerr', new THREE.BufferAttribute(w, 3));
        if (o.material) o.material.needsUpdate = true;
      });
    } else {
      // No LAD / LCX / RCA parts in this model: give every mesh an empty weight so the shader still compiles
      object.traverse((o) => {
        if (!o.isMesh || o.geometry.attributes.aTerr) return;
        o.geometry.setAttribute('aTerr', new THREE.BufferAttribute(new Float32Array(o.geometry.attributes.position.count * 3), 3));
      });
    }

    const anchors = [];
    byPart.forEach(({ info, meshes }) => {
      if (!info.anchor) return;
      const box = new THREE.Box3();
      meshes.forEach((m) => box.expandByObject(m));
      const c = box.getCenter(new THREE.Vector3());
      const best = c.clone();
      let bestD = Infinity;
      meshes.forEach((m) => {
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          const d = v.distanceToSquared(c);
          if (d < bestD) { bestD = d; best.copy(v); }
        }
      });
      anchors.push({ info, center: best });
    });

    return { s, offset: sphere.center.clone().multiplyScalar(-s), byPart, anchors };
  }, [object, mats, registry]);

  useEffect(() => {
    onReady?.([...model.byPart.values()].map(({ info }) => info));
  }, [model, onReady]);

  useEffect(() => {
    const made = [];
    const add = (id, mat) => model.byPart.get(id)?.meshes.forEach((m) => {
      const o = new THREE.Mesh(m.geometry, mat);
      o.raycast = () => {};
      m.add(o);
      made.push(o);
    });
    if (selectedId) add(selectedId, pickMat);
    if (hoveredId && hoveredId !== selectedId) add(hoveredId, HOVER_MAT);
    return () => made.forEach((o) => o.parent?.remove(o));
  }, [model, hoveredId, selectedId, pickMat]);

  useEffect(() => {
    if (!selectedId || !focusOnSelect || !groupRef.current) return;
    const entry = model.byPart.get(selectedId);
    if (!entry) return;
    const anchor = model.anchors.find((a) => a.info.id === selectedId);
    const c = new THREE.Vector3();
    if (anchor) c.copy(anchor.center);
    else {
      const box = new THREE.Box3();
      entry.meshes.forEach((m) => box.expandByObject(m));
      box.getCenter(c);
    }
    groupRef.current.updateWorldMatrix(true, false);
    groupRef.current.localToWorld(c);
    if (c.lengthSq() > 1e-6) onFocus?.(c.normalize());
  }, [selectedId, focusOnSelect, model, onFocus]);

  const inner = <primitive object={object} />;
  return (
    <group
      ref={groupRef}
      position={model.offset}
      scale={model.s}
      onPointerMove={(e) => { e.stopPropagation(); onHover(e.object.userData.part ?? null, e.nativeEvent); }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => { e.stopPropagation(); if (e.delta <= 4) onSelect(e.object.userData.part ?? null); }}
    >
      {fastPicking ? <Bvh firstHitOnly>{inner}</Bvh> : inner}
      <PinTracker anchors={model.anchors} groupRef={groupRef} pinRefs={pinRefs} />
    </group>
  );
}

function LoaderChip({ label, themeObj }) {
  return (
    <div className={`flex items-center gap-2 whitespace-nowrap ${themeObj.panelCss}`}>
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" />
      {label}
    </div>
  );
}

function GltfAnatomy({ url, mats, partApi, pickColor }) {
  const { scene } = useGLTF(url);
  const object = useMemo(() => scene.clone(true), [scene]);
  return <FittedModel object={object} mats={mats} partApi={partApi} pickColor={pickColor} />;
}

function useObjParts(manifestUrl) {
  const [st, setSt] = useState({ status: 'loading', root: null, error: null });
  useEffect(() => {
    let alive = true;
    let root = null;
    (async () => {
      try {
        const res = await fetch(manifestUrl);
        if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) {
          throw new Error(`Manifest not found at ${manifestUrl}`);
        }
        const list = await res.json();
        const files = (Array.isArray(list) ? list : [list]).filter((f) => typeof f === 'string');
        if (!files.length) throw new Error('Manifest lists no .obj files');
        if (!alive) return;

        const base = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
        const loader = new OBJLoader();
        root = new THREE.Group();
        const results = await Promise.allSettled(files.map(async (file) => {
          const obj = await loader.loadAsync(base + file);
          obj.traverse((c) => { if (c.isMesh) c.name = c.name ? `${file}:${c.name}` : file; });
          if (alive) root.add(obj);
        }));
        if (!alive) return;
        results.forEach((r, i) => { if (r.status === 'rejected') console.warn(`Skipped ${files[i]}`, r.reason); });
        if (!root.children.length) throw new Error('None of the listed .obj parts could be loaded');
        setSt({ status: 'ready', root, error: null });
      } catch (error) {
        if (alive) setSt({ status: 'error', root: null, error });
      }
    })();
    return () => {
      alive = false;
      root?.traverse((o) => o.geometry?.dispose());
    };
  }, [manifestUrl]);
  return st;
}

function ObjPartsAnatomy({ manifestUrl, mats, partApi, pickColor }) {
  const { status, root, error } = useObjParts(manifestUrl);
  if (status === 'error') throw error;
  if (status === 'loading') return null;
  return <FittedModel object={root} mats={mats} partApi={partApi} pickColor={pickColor} />;
}

/* Procedural schematic fallback */
const BODY = { c: [0.05, -0.15, 0], r: [0.78, 1.0, 0.72] };
const surf = (phi, theta, s = 1.02) => new THREE.Vector3(
  BODY.c[0] + BODY.r[0] * Math.sin(phi) * Math.cos(theta) * s,
  BODY.c[1] + BODY.r[1] * Math.cos(phi) * s,
  BODY.c[2] + BODY.r[2] * Math.sin(phi) * Math.sin(theta) * s,
);
const tube = (pts, r, seg = 48) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 12, false);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function ProceduralAnatomy({ mats, partApi, pickColor }) {
  const group = useMemo(() => {
    const g = new THREE.Group();
    const add = (name, geo, pos, scale) => {
      const m = new THREE.Mesh(geo);
      m.name = name;
      if (pos) m.position.set(...pos);
      if (scale) m.scale.set(...scale);
      g.add(m);
    };
    add('Myocardium', new THREE.SphereGeometry(1, 64, 48), BODY.c, BODY.r);
    add('Right_atrium', new THREE.SphereGeometry(1, 32, 24), [-0.62, 0.5, 0.08], [0.4, 0.42, 0.38]);
    add('Left_atrium', new THREE.SphereGeometry(1, 32, 24), [0.5, 0.62, -0.3], [0.36, 0.32, 0.34]);
    add('Aorta', tube([V(0.1, 0.6, 0.05), V(0.1, 1.0, 0.05), V(0.3, 1.4, 0), V(0.7, 1.25, -0.15), V(0.82, 0.75, -0.22)], 0.17));
    add('Pulmonary_artery', tube([V(0.25, 0.55, 0.4), V(0.1, 0.95, 0.42), V(-0.2, 1.2, 0.28)], 0.14));
    add('Superior_vena_cava', tube([V(-0.6, 0.7, 0.05), V(-0.62, 1.15, 0.05), V(-0.55, 1.55, 0)], 0.13));
    add('Inferior_vena_cava', tube([V(-0.55, -0.1, -0.05), V(-0.6, -0.65, -0.1), V(-0.6, -1.05, -0.1)], 0.13));
    add('LAD', tube([[0.55, 1.35], [1.0, 1.3], [1.5, 1.25], [2.0, 1.22], [2.5, 1.25], [2.85, 1.4]].map(([p, t]) => surf(p, t)), 0.04, 64));
    add('LCX', tube([[0.7, 1.0], [0.8, 0.6], [0.85, 0.2], [0.85, -0.3], [0.85, -0.8]].map(([p, t]) => surf(p, t)), 0.04, 64));
    add('RCA', tube([[0.7, 1.9], [0.85, 2.4], [1.0, 2.9], [1.15, 3.4], [1.4, 3.9]].map(([p, t]) => surf(p, t)), 0.04, 64));
    return g;
  }, []);
  useEffect(() => () => group.traverse((o) => o.geometry?.dispose()), [group]);
  return <FittedModel object={group} mats={mats} partApi={partApi} pickColor={pickColor} />;
}

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { this.props.onError?.(error, info); }
  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}

/* Studio lighting */
function StudioLights({ themeObj }) {
  const rig = useRef();
  const camera = useThree((s) => s.camera);
  const isLight = themeObj.id === 'light';

  useFrame(() => rig.current?.quaternion.copy(camera.quaternion));
  return (
    <group ref={rig}>
      {Object.entries(RIG).map(([id, l]) => (
        <directionalLight
          key={id}
          position={l.pos}
          color={l.color}
          intensity={l.intensity * (isLight ? 1.15 : 1.0)}
        />
      ))}
    </group>
  );
}

// ---- Camera sync -----------------------------------------------------------------------------------
// Viewers that share a syncKey move as one: rotate, zoom, pan, view buttons and auto-rotate on either heart
// drive both. Exactly one viewer in a group is the "leader" (whoever you touched last) and only the leader
// broadcasts, so the two cameras can never fight each other. Followers are snapped to the leader's exact
// position and target with damping and auto-rotate switched off for that single update.
const syncBus = new Map();
function useCameraSync(syncKey, controls, camera, onLoseLead) {
  const [lead, setLead] = useState(true);
  const claimRef = useRef(() => {});
  const loseLeadRef = useRef(onLoseLead);
  loseLeadRef.current = onLoseLead;

  useEffect(() => {
    const c = controls.current;
    if (!syncKey || !c) { setLead(true); claimRef.current = () => {}; return undefined; }

    let group = syncBus.get(syncKey);
    if (!group) { group = { members: new Set(), leader: null }; syncBus.set(syncKey, group); }

    let applying = false;
    const member = {
      setLead,
      lose() { loseLeadRef.current?.(); },
      apply(pos, target) {
        applying = true;
        const { autoRotate, enableDamping } = c;
        c.autoRotate = false;
        c.enableDamping = false;
        c.target.copy(target);
        camera.position.copy(pos);
        c.update();
        c.autoRotate = autoRotate;
        c.enableDamping = enableDamping;
        applying = false;
      },
    };
    const claim = () => {
      if (group.leader === member) return;
      const prev = group.leader;
      group.leader = member;
      if (prev) { prev.setLead(false); prev.lose(); }
      setLead(true);
    };
    claimRef.current = claim;

    group.members.add(member);
    if (!group.leader) group.leader = member; else setLead(false);

    const onChange = () => {
      if (applying || group.leader !== member) return;
      group.members.forEach((m) => { if (m !== member) m.apply(camera.position, c.target); });
    };
    c.addEventListener('start', claim);   // any drag / wheel / touch makes this heart the leader
    c.addEventListener('change', onChange);
    return () => {
      c.removeEventListener('start', claim);
      c.removeEventListener('change', onChange);
      group.members.delete(member);
      if (group.leader === member) {
        group.leader = group.members.values().next().value ?? null;
        group.leader?.setLead(true);
      }
      if (!group.members.size) syncBus.delete(syncKey);
    };
  }, [syncKey, controls, camera]);

  return { lead, claim: useCallback(() => claimRef.current(), []) };
}

const _q = new THREE.Quaternion();
const _step = new THREE.Quaternion();
const _v = new THREE.Vector3();
const ORIGIN = new THREE.Vector3();

function CameraRig({ request, autoRotate, onViewLabel, syncKey, externalRef = null, onControlsChange = null }) {
  const controls = useRef(null);
  const camera = useThree((s) => s.camera);
  const goal = useRef(null);
  const last = useRef('');
  const { lead, claim } = useCameraSync(syncKey, controls, camera, () => { goal.current = null; });

  // A view button (Anterior, Posterior...) pressed on this heart makes it the leader, so both hearts swing together
  useEffect(() => {
    goal.current = request ? (request.dir ?? VIEW_DIRS[request.id]) : null;
    if (request) claim();
  }, [request, claim]);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    if (goal.current) {
      const k = 1 - Math.exp(-6 * Math.min(delta, 0.1));
      const r = camera.position.length();
      _v.copy(camera.position).normalize();
      _q.setFromUnitVectors(_v, goal.current);
      _step.identity().slerp(_q, k);
      _v.applyQuaternion(_step);
      const nr = r + (CAM_DIST - r) * k;
      camera.position.copy(_v).multiplyScalar(nr);
      c.target.lerp(ORIGIN, k);
      c.update();
      if (_v.angleTo(goal.current) < 0.002 && Math.abs(nr - CAM_DIST) < 0.01) goal.current = null;
    }
    _v.copy(camera.position).normalize();
    let best = 'Oblique';
    let bestDot = 0.88;
    for (const [id, dir] of Object.entries(VIEW_DIRS)) {
      const d = _v.dot(dir);
      if (d > bestDot) { bestDot = d; best = VIEWS[id].label; }
    }
    if (best !== last.current) { last.current = best; onViewLabel(best); }
  });

  // One stable callback ref: keeps the internal ref and hands the controls to the parent's ref.
  const externalRefLatest = useRef(externalRef);
  externalRefLatest.current = externalRef;
  const setControls = useCallback((node) => {
    controls.current = node;
    const ext = externalRefLatest.current;
    if (!ext) return;
    if (typeof ext === 'function') ext(node);
    else ext.current = node;
  }, []);

  // Clear the parent's ref when the rig unmounts so it never points at disposed controls
  useEffect(() => () => {
    const ext = externalRefLatest.current;
    if (!ext) return;
    if (typeof ext === 'function') ext(null);
    else ext.current = null;
  }, []);

  return (
    <OrbitControls
      ref={setControls}
      onChange={(e) => onControlsChange?.(e)}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.7}
      zoomSpeed={0.7}
      minDistance={2.4}
      maxDistance={8}
      enablePan
      autoRotate={autoRotate && lead}
      autoRotateSpeed={0.9}
      onStart={() => { goal.current = null; claim(); }}
    />
  );
}

function ViewerFallback({ message, error, onRetry, themeObj }) {
  return (
    <div role="alert" className={`absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center ${themeObj.id === 'light' ? 'bg-slate-50 text-slate-800' : 'bg-[#0f1417] text-[#ece5da]'}`}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-60" aria-hidden="true">
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
      </svg>
      <p className="text-sm font-medium">The 3D heart could not be shown</p>
      <p className="max-w-sm text-xs opacity-70">
        {message ?? 'The viewer failed to start. Risk results elsewhere on the page are not affected.'}
      </p>
      {error && <p className="max-w-sm truncate text-[10px] opacity-50">{String(error.message ?? error)}</p>}
      <button type="button" onClick={onRetry} className={themeObj.btnCss}>Try again</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main HeartViewer component                                          */
/* ------------------------------------------------------------------ */
export default function HeartViewer({
  riskLevel: riskLevelProp,
  overallRisk,                 // alias of riskLevel
  overallProb,
  vesselRisk: vesselRiskProp,
  vesselProbs,                 // alias of vesselRisk
  externalRef = null,          // optional ref (object or callback) that receives the OrbitControls instance
  onControlsChange = null,     // optional callback fired on every OrbitControls change
  theme = 'dark',
  selectedPart,
  onPartSelect,
  onPartsLoaded,
  partRegistry = NO_REGISTRY,
  showLabels: showLabelsProp = true,
  showStatus = true,
  educational = false,
  paused = false,
  focusOnSelect = true,
  fastPicking = true,
  severity,
  syncKey,
  pulse = false,
  bpm,
  manifestUrl = '/heart/manifest.json',
  modelUrl = null,
  modelRotation = [0, 0, 0],
  tissueShader = true,
  defaultAutoRotate = false,
  showDisclaimer = true,
  className = 'h-[560px]',
}) {
  const riskLevel = riskLevelProp ?? overallRisk;
  const vesselRisk = vesselRiskProp ?? vesselProbs;

  const [currentTheme, setCurrentTheme] = useState(theme === 'light' ? 'light' : 'dark');
  const activeTheme = THEMES[currentTheme] || THEMES.dark;

  // What risk to show. The numbers win over a missing or stale level: we use the HIGHER of the level passed in
  // and the level the numbers imply, so "Normal" can never be displayed next to a 95% risk.
  const effRisk = educational ? EDU_RISK : vesselRisk;
  const overallN = educational ? undefined : readProb(overallProb);
  const worstVessel = useMemo(() => {
    const ps = VESSELS.map((v) => vesselProb(effRisk, v)).filter((p) => p != null);
    return ps.length ? Math.max(...ps) : undefined;
  }, [effRisk]);
  const impliedProb = overallN ?? worstVessel;
  const explicitLevel = educational ? RISK.Normal : getRisk(riskLevel);
  const impliedLevel = impliedProb !== undefined ? getRisk(riskLevelFromProb(impliedProb)) : RISK.Normal;
  const risk = RISK_ORDER.indexOf(impliedLevel.short) > RISK_ORDER.indexOf(explicitLevel.short) ? impliedLevel : explicitLevel;
  const dimming = severity ?? (educational ? 0 : (worstVessel !== undefined || overallN !== undefined
    ? Math.max(worstVessel ?? 0, overallN ?? 0) : undefined));

  const shownBpm = Math.round(clamp(num(bpm, risk.bpm), 40, 200));
  const showRate = pulse || bpm != null;
  const calm = useMemo(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const { active, progress } = useProgress();

  const [autoRotate, setAutoRotate] = useState(defaultAutoRotate && !calm);
  const [viewReq, setViewReq] = useState(null);
  const [viewLabel, setViewLabel] = useState('Anterior');
  const [labelsOn, setLabelsOn] = useState(showLabelsProp);
  const [modelError, setModelError] = useState(null);
  const [ctxLost, setCtxLost] = useState(false);
  const [ready, setReady] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const registry = useMemo(() => [...partRegistry, ...DEFAULT_REGISTRY], [partRegistry]);
  const [partsList, setPartsList] = useState([]);
  const [hoverId, setHoverId] = useState(null);
  const [internalSel, setInternalSel] = useState(null);
  const selectedId = selectedPart !== undefined ? selectedPart : internalSel;
  const partsById = useMemo(() => new Map(partsList.map((p) => [p.id, p])), [partsList]);
  const hoverInfo = hoverId ? partsById.get(hoverId) : null;
  const selectedInfo = selectedId ? partsById.get(selectedId) : null;

  // Tell the developer when vessel data arrives in a shape we cannot read
  useEffect(() => {
    if (!vesselRisk || educational) return;
    if (VESSELS.every((v) => vesselProb(vesselRisk, v) === undefined)) {
      console.warn('[HeartViewer] vesselRisk was given but no LAD / LCX / RCA value could be read from it:', vesselRisk);
    }
  }, [vesselRisk, educational]);

  const boxRef = useRef(null);
  const tipRef = useRef(null);
  const lastPos = useRef({ x: 0, y: 0 });
  const pinRefs = useRef(new Map());
  const selRef = useRef(null);
  selRef.current = selectedId;
  const onPartSelectRef = useRef(onPartSelect);
  onPartSelectRef.current = onPartSelect;
  const onPartsLoadedRef = useRef(onPartsLoaded);
  onPartsLoadedRef.current = onPartsLoaded;

  const onReady = useCallback((list) => {
    setPartsList(list);
    setReady(true);
    onPartsLoadedRef.current?.(list);
  }, []);

  const placeTip = useCallback(() => {
    const tip = tipRef.current;
    const box = boxRef.current;
    if (!tip || !box) return;
    const { x: cx, y: cy } = lastPos.current;
    let x = cx + 14;
    let y = cy + 14;
    if (x + tip.offsetWidth > box.clientWidth - 8) x = cx - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > box.clientHeight - 8) y = cy - tip.offsetHeight - 14;
    tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }, []);

  const onHover = useCallback((info, ev) => {
    if (ev) { lastPos.current = { x: ev.offsetX, y: ev.offsetY }; placeTip(); }
    const id = info?.id ?? null;
    setHoverId((h) => (h === id ? h : id));
  }, [placeTip]);
  useLayoutEffect(placeTip, [hoverId, placeTip]);

  const select = useCallback((info) => {
    const next = info && info.id !== selRef.current ? info : null;
    setInternalSel(next ? next.id : null);
    onPartSelectRef.current?.(next);
  }, []);
  const onFocus = useCallback((dir) => setViewReq({ dir, n: Date.now() }), []);

  const retry = useCallback(() => {
    if (modelUrl) useGLTF.clear(modelUrl);
    setModelError(null);
    setCtxLost(false);
    setReady(false);
    setResetKey((k) => k + 1);
  }, [modelUrl]);

  const goTo = (id) => setViewReq({ id, n: Date.now() });
  const toggleTheme = () => setCurrentTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const heartProps = {
    riskLevel: risk.short, bpm, calm, pulse, vesselRisk: effRisk, severity: dimming,
    procedural: tissueShader, modelRotation,
  };
  const partApi = {
    registry, onHover, onSelect: select, onFocus, onReady, pinRefs,
    hoveredId: hoverId, selectedId, vesselRisk: effRisk, fastPicking, focusOnSelect,
  };

  const selProb = educational ? undefined : vesselProb(vesselRisk, selectedInfo?.vessel);
  const hoverProb = educational ? undefined : vesselProb(vesselRisk, hoverInfo?.vessel);
  const overallPct = impliedProb !== undefined && !educational ? Math.round(impliedProb * 100) : null;

  return (
    <div
      ref={boxRef}
      className={`relative w-full overflow-hidden rounded-2xl ring-1 ${activeTheme.id === 'light' ? 'ring-slate-900/10 shadow-lg' : 'ring-white/10'} ${className}`}
      style={{
        background: activeTheme.gradient,
        cursor: hoverId ? 'pointer' : undefined,
      }}
      role="group"
      aria-label="Interactive 3D heart model"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[62%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.13] blur-3xl transition-colors duration-700"
        style={{ backgroundColor: risk.color }}
      />

      <ErrorBoundary
        key={resetKey}
        fallback={(error) => <ViewerFallback error={error} onRetry={retry} themeObj={activeTheme} />}
      >
        {ctxLost ? (
          <ViewerFallback message="The graphics context was lost. Reload the viewer to continue." onRetry={retry} themeObj={activeTheme} />
        ) : (
          <>
            <Canvas
              camera={{ position: VIEW_DIRS.anterior.clone().multiplyScalar(CAM_DIST).toArray(), fov: 38, near: 0.1, far: 50 }}
              dpr={[1, 1.75]}
              frameloop={paused ? 'never' : 'always'}
              gl={{ antialias: true, alpha: true }}
              onPointerMissed={() => select(null)}
              onCreated={({ gl }) => {
                gl.toneMappingExposure = activeTheme.id === 'light' ? 1.15 : 1.05;
                gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setCtxLost(true); });
              }}
            >
              <ambientLight intensity={activeTheme.id === 'light' ? 0.35 : 0.18} color="#ffe4e1" />
              <StudioLights themeObj={activeTheme} />
              <Environment resolution={256} frames={1} environmentIntensity={activeTheme.envIntensity}>
                <Lightformer form="rect" intensity={2.2} color="#fff3e8" position={[0, 4, 3]} scale={[9, 3, 1]} target={[0, 0, 0]} />
                <Lightformer form="rect" intensity={1.1} color="#cfe4ff" position={[-5, 1, -2]} scale={[3, 6, 1]} target={[0, 0, 0]} />
                <Lightformer form="ring" intensity={1.4} color="#ffd6c9" position={[4, 0, -3]} scale={4} target={[0, 0, 0]} />
              </Environment>

              <Suspense fallback={null}>
                <ErrorBoundary
                  onError={(e) => { console.warn('[HeartViewer] model failed, showing schematic heart:', e); setModelError(e); }}
                  fallback={() => (
                    <BeatingHeart {...heartProps}>
                      {(mats) => <ProceduralAnatomy mats={mats} partApi={partApi} pickColor={activeTheme.pick} />}
                    </BeatingHeart>
                  )}
                >
                  <BeatingHeart {...heartProps}>
                    {(mats) => (modelUrl
                      ? <GltfAnatomy url={modelUrl} mats={mats} partApi={partApi} pickColor={activeTheme.pick} />
                      : <ObjPartsAnatomy manifestUrl={manifestUrl} mats={mats} partApi={partApi} pickColor={activeTheme.pick} />)}
                  </BeatingHeart>
                </ErrorBoundary>
              </Suspense>

              <CameraRig
                request={viewReq}
                autoRotate={autoRotate}
                onViewLabel={setViewLabel}
                syncKey={syncKey}
                externalRef={externalRef}
                onControlsChange={onControlsChange}
              />
              <AdaptiveDpr />
            </Canvas>

            {!ready && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <LoaderChip label={`Loading anatomy${active ? ` ${Math.round(progress)}%` : '…'}`} themeObj={activeTheme} />
              </div>
            )}

            {/* Pins. Vessel pins carry the predicted percentage and are coloured by it. */}
            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
              {labelsOn && partsList.filter((p) => p.anchor).map((p) => {
                const prob = educational ? undefined : vesselProb(vesselRisk, p.vessel);
                const col = prob == null ? null : riskHex(prob);
                const isSel = selectedId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    ref={(el) => { if (el) pinRefs.current.set(p.id, el); else pinRefs.current.delete(p.id); }}
                    onClick={() => select(p)}
                    style={{
                      position: 'absolute', left: 0, top: 0, opacity: 0, pointerEvents: 'none',
                      boxShadow: isSel
                        ? `0 0 0 2px ${activeTheme.pick}, 0 2px 8px rgba(0,0,0,0.35)`
                        : `0 0 0 1.5px ${col ? `${col}cc` : 'rgba(148,163,184,0.45)'}, 0 2px 8px rgba(0,0,0,0.3)`,
                    }}
                    className={`flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-[11px] transition-opacity duration-200 ${activeTheme.pinCss}`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col ?? activeTheme.mute }} />
                    {p.vessel ?? p.label}
                    {prob != null && <span className="font-semibold tabular-nums" style={{ color: col }}>{Math.round(prob * 100)}%</span>}
                  </button>
                );
              })}
            </div>

            <div
              ref={tipRef}
              className={`${activeTheme.panelCss} pointer-events-none absolute left-0 top-0 z-20 w-max max-w-[16rem]`}
              style={{ visibility: hoverInfo ? 'visible' : 'hidden' }}
            >
              <div className="font-medium">{hoverInfo?.label}</div>
              {hoverProb != null && (
                <div className="opacity-70">Stenosis risk <span className="font-semibold tabular-nums" style={{ color: riskHex(hoverProb) }}>{Math.round(hoverProb * 100)}%</span></div>
              )}
            </div>

            {(showStatus || modelError) && (
              <div className="pointer-events-none absolute left-4 top-4 z-10 flex max-w-[16rem] flex-col gap-2">
                {showStatus && (
                  <>
                    <div className={`${activeTheme.panelCss} flex items-center gap-2`}>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: risk.color }} />
                      <span className="font-medium">{risk.short} risk</span>
                      {overallPct !== null && <span className="tabular-nums opacity-70">{overallPct}%</span>}
                      {pulse && <span className="opacity-70">{risk.note}</span>}
                    </div>
                    <div className={activeTheme.panelCss}><span className="opacity-70">View </span>{viewLabel}</div>
                  </>
                )}
                {modelError && (
                  <div className={`${activeTheme.panelCss} pointer-events-auto text-amber-500`}>
                    Detailed anatomy is unavailable, so a schematic heart is shown.{' '}
                    <button type="button" onClick={retry} className="underline underline-offset-2">Retry</button>
                  </div>
                )}
              </div>
            )}

            <div className="pointer-events-none absolute right-4 top-4 z-10 flex w-56 flex-col items-end gap-2">
              {showRate && (
                <div className={`${activeTheme.panelCss} text-right`}>
                  <div className="flex items-center justify-end gap-2 opacity-70">
                    <span className="relative flex h-2.5 w-2.5">
                      {pulse && (
                        <span
                          className="absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping"
                          style={{ backgroundColor: risk.color, animationDuration: `${60 / shownBpm}s` }}
                        />
                      )}
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: risk.color }} />
                    </span>
                    {bpm != null ? 'Pulse rate' : 'Simulated rate'}
                  </div>
                  <div className="text-3xl font-semibold tabular-nums">
                    {shownBpm}<span className="ml-1 text-sm font-normal opacity-70">bpm</span>
                  </div>
                </div>
              )}
              {selectedInfo && !educational && (
                <div className={`${activeTheme.panelCss} pointer-events-auto w-full`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">{selectedInfo.label}</div>
                    <button type="button" aria-label="Clear selection" onClick={() => select(null)} className="opacity-60 hover:opacity-100">×</button>
                  </div>
                  {selProb != null ? (
                    <>
                      <div className="mt-2 flex items-baseline justify-between opacity-70">
                        <span>Stenosis risk</span>
                        <span className="text-sm font-semibold tabular-nums" style={{ color: riskHex(selProb) }}>{Math.round(selProb * 100)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-500/20">
                        <div className="h-full rounded-full" style={{ width: `${Math.round(selProb * 100)}%`, backgroundColor: riskHex(selProb) }} />
                      </div>
                      <p className="mt-2 text-[11px] opacity-70">
                        Vessel-level estimate. It does not show where along the vessel a narrowing sits.
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 opacity-70">No risk value is attached to this structure.</p>
                  )}
                </div>
              )}
            </div>

            <div className="pointer-events-none absolute inset-x-4 bottom-3 z-10 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {Object.entries(VIEWS).map(([id, v]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => goTo(id)}
                    aria-current={viewLabel === v.label}
                    className={`${activeTheme.btnCss} ${viewLabel === v.label ? activeTheme.btnActiveCss : ''}`}
                  >
                    {v.label}
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-current opacity-20" />
                <button
                  type="button"
                  aria-pressed={labelsOn}
                  onClick={() => setLabelsOn((l) => !l)}
                  className={`${activeTheme.btnCss} ${labelsOn ? activeTheme.btnActiveCss : ''}`}
                >
                  Labels
                </button>
                <button
                  type="button"
                  aria-pressed={autoRotate}
                  onClick={() => setAutoRotate((a) => !a)}
                  className={`${activeTheme.btnCss} ${autoRotate ? activeTheme.btnActiveCss : ''}`}
                >
                  Auto-rotate
                </button>
                <button type="button" onClick={toggleTheme} className={activeTheme.btnCss}>
                  {currentTheme === 'dark' ? '☀️ Light' : '🌙 Dark'}
                </button>
                <button type="button" onClick={() => goTo('anterior')} className={activeTheme.btnCss}>Reset camera</button>
              </div>
              {showDisclaimer && (
                <p className="text-[11px] opacity-70">
                  For decision support and education only. Not a substitute for formal diagnostic imaging.
                </p>
              )}
            </div>
          </>
        )}
      </ErrorBoundary>
    </div>
  );
}

export const preloadHeartModel = (url) => useGLTF.preload(url);