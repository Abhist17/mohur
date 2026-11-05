"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type SceneState = {
  /** coins per token (ETH, BTC, USDC) for the main pile */
  counts: [number, number, number];
  /** "merged": one pile between both counters; "split": two piles, one per counter */
  layout: "merged" | "split";
  /** share of each stack sitting at the Uniswap pile when split (0..1) */
  splitShare?: [number, number, number];
  /** draw links from counters to the pile */
  links: boolean;
};

const COLORS = [0xd9a441, 0xc47a4a, 0xb9c0c8];
const ROUGH = [0.28, 0.35, 0.22];
const MAX = 90;
const COIN_H = 0.075;

/**
 * The wallet as three stacks of coins (gold ETH, copper BTC, silver USDC), with Uniswap and 1inch as two counters
 * drawing from them. Pure three.js; the parent drives it through `state`.
 */
export function StacksScene({ state }: { state: SceneState }) {
  const host = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 4.6, 11.5);
    camera.lookAt(0, 1.3, 0);

    scene.add(new THREE.HemisphereLight(0xfff2dd, 0x2a1d0c, 1.6));
    const key = new THREE.DirectionalLight(0xffe6b8, 3.6);
    key.position.set(4, 8, 6);
    scene.add(key);
    const rim = new THREE.PointLight(0xd9a441, 30, 20);
    rim.position.set(-5, 3, -3);
    scene.add(rim);
    const front = new THREE.DirectionalLight(0xfff4e0, 1.4);
    front.position.set(0, 3, 9);
    scene.add(front);

    const world = new THREE.Group();
    scene.add(world);

    // floor
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(9, 64),
      new THREE.MeshStandardMaterial({ color: 0x15120e, roughness: 0.95, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    world.add(floor);

    // counters (stalls)
    const counterGeo = new THREE.BoxGeometry(1.7, 1.0, 1.1);
    const stripGeo = new THREE.BoxGeometry(1.72, 0.12, 1.12);
    const mkCounter = (x: number, color: number) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(counterGeo, new THREE.MeshStandardMaterial({ color: 0x241e17, roughness: 0.7 }));
      body.position.y = 0.5;
      const strip = new THREE.Mesh(stripGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }));
      strip.position.y = 1.0;
      g.add(body, strip);
      g.position.set(x, 0, 0.6);
      world.add(g);
      return g;
    };
    mkCounter(-4.3, 0xff007a);
    mkCounter(4.3, 0x2f8af5);

    // links
    const linkMat = new THREE.LineDashedMaterial({ color: 0xd9a441, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0 });
    const mkLink = (x: number) => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 1.05, 0.6), new THREE.Vector3(x * 0.32, 0.6, 0)]);
      const l = new THREE.Line(geo, linkMat);
      l.computeLineDistances();
      world.add(l);
    };
    mkLink(-4.3);
    mkLink(4.3);

    // coins
    const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, COIN_H * 0.92, 48);
    const meshes = COLORS.map((c, t) => {
      const m = new THREE.InstancedMesh(coinGeo, new THREE.MeshStandardMaterial({ color: c, metalness: 0.92, roughness: ROUGH[t] }), MAX);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; // instances move a lot; a stale bounding sphere would cull whole stacks
      world.add(m);
      return m;
    });
    const cur = COLORS.map(() => Array.from({ length: MAX }, () => ({ p: new THREE.Vector3(0, 6, 0), s: 0 })));
    const dummy = new THREE.Object3D();

    const target = (t: number, i: number, st: SceneState): { p: THREE.Vector3; s: number } => {
      const n = Math.max(0, Math.min(MAX, Math.round(st.counts[t])));
      if (i >= n) return { p: new THREE.Vector3((t - 1) * 1.05, 5, 0), s: 0 };
      if (st.layout === "merged") {
        return { p: new THREE.Vector3((t - 1) * 1.05, COIN_H / 2 + i * COIN_H, 0), s: 1 };
      }
      const share = st.splitShare?.[t] ?? 0.5;
      const nLeft = Math.round(n * share);
      const left = i < nLeft;
      const j = left ? i : i - nLeft;
      const cx = left ? -2.2 : 2.2;
      return { p: new THREE.Vector3(cx + (t - 1) * 0.9, COIN_H / 2 + j * COIN_H, 0), s: 1 };
    };

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.fov = w < 640 ? 46 : 32;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    const clock = new THREE.Clock();
    const tick = () => {
      const time = clock.getElapsedTime();
      const st = stateRef.current;
      world.rotation.y = Math.sin(time * 0.25) * 0.12;
      linkMat.opacity += ((st.links ? 0.85 : 0) - linkMat.opacity) * 0.08;
      for (let t = 0; t < 3; t++) {
        for (let i = 0; i < MAX; i++) {
          const tg = target(t, i, st);
          const c = cur[t][i];
          // staggered motion: higher coins move a bit later, giving a "pour"
          const k = 0.07 + 0.05 * Math.max(0, 1 - i / 60);
          c.p.lerp(tg.p, k);
          c.s += (tg.s - c.s) * 0.12;
          dummy.position.copy(c.p);
          dummy.rotation.set(0, i * 0.7 + t, 0);
          dummy.scale.setScalar(Math.max(0.0001, c.s));
          dummy.updateMatrix();
          meshes[t].setMatrixAt(i, dummy.matrix);
        }
        meshes[t].instanceMatrix.needsUpdate = true;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={host} style={{ position: "absolute", inset: 0 }} />;
}
