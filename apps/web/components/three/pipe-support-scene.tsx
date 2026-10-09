"use client";

import { Environment, Grid, Html, Lightformer, Line } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";

export type SceneMode = "render" | "cad";

type PartId = "channel" | "rodL" | "rodR" | "pipeA" | "pipeB" | "pipeC";

const PART_INFO: Record<PartId, { title: string; spec: string }> = {
  channel: { title: "FXT Strut Channel 41×41", spec: "2.5 mm · HDG · slotted" },
  rodL: { title: "Threaded drop rod M10", spec: "Grade 4.8 · zinc plated" },
  rodR: { title: "Threaded drop rod M10", spec: "Grade 4.8 · zinc plated" },
  pipeA: { title: "Pipe clamp M8/M10 · DN150", spec: "EPDM insert · acoustic" },
  pipeB: { title: "Pipe clamp M8/M10 · DN100", spec: "EPDM insert · acoustic" },
  pipeC: { title: "Pipe clamp M8/M10 · DN80", spec: "EPDM insert · acoustic" },
};

const CHANNEL_LENGTH = 4.2;
const CH = 0.41;
const T = 0.03;
const ROD_X = 1.85;
const ROD_TOP = 3.2;
const PIPES: Array<{ id: PartId; x: number; r: number; color: string }> = [
  { id: "pipeA", x: -0.95, r: 0.42, color: "#b7c2cc" },
  { id: "pipeB", x: 0.25, r: 0.3, color: "#c7432f" },
  { id: "pipeC", x: 1.1, r: 0.22, color: "#2f6fb0" },
];
const PIPE_LENGTH = 7;

const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 4);

function useAssembly(delay: number, from: [number, number, number]) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const k = 1 - ease((clock.elapsedTime - delay) / 1.4);
    ref.current.position.set(from[0] * k, from[1] * k, from[2] * k);
    ref.current.visible = clock.elapsedTime > delay - 0.05;
  });
  return ref;
}

function Mat({ color, hovered, mode, metal = 0.85, rough = 0.32, opacity = 1 }: { color: string; hovered: boolean; mode: SceneMode; metal?: number; rough?: number; opacity?: number }) {
  if (mode === "cad") {
    return <meshBasicMaterial color={hovered ? "#ffffff" : "#3fd0ff"} wireframe transparent opacity={hovered ? 0.95 : 0.55} />;
  }
  return (
    <meshStandardMaterial
      color={hovered ? "#3fd0ff" : color}
      emissive={hovered ? "#3fd0ff" : "#000000"}
      emissiveIntensity={hovered ? 0.35 : 0}
      metalness={metal}
      roughness={rough}
      transparent={opacity < 1}
      opacity={opacity}
    />
  );
}

function Label({ id, position }: { id: PartId; position: [number, number, number] }) {
  const info = PART_INFO[id];
  return (
    <Html position={position} center distanceFactor={9} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div className="whitespace-nowrap border border-cyan/60 bg-void/85 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white shadow-glow backdrop-blur">
        <p className="text-cyan">{info.title}</p>
        <p className="mt-0.5 text-white/60">{info.spec}</p>
      </div>
    </Html>
  );
}

type PartProps = { hovered: PartId | null; mode: SceneMode; hover: (id: PartId | null) => (e: ThreeEvent<PointerEvent>) => void };

function Channel({ hovered, mode, hover }: PartProps) {
  const ref = useAssembly(0.2, [0, -2.2, 0]);
  const on = hovered === "channel";
  const slots = useMemo(() => Array.from({ length: 14 }, (_, i) => -CHANNEL_LENGTH / 2 + 0.3 + i * ((CHANNEL_LENGTH - 0.6) / 13)), []);
  return (
    <group ref={ref} onPointerOver={hover("channel")} onPointerOut={hover(null)}>
      <mesh position={[0, T / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[CHANNEL_LENGTH, T, CH]} />
        <Mat color="#9aa6b1" hovered={on} mode={mode} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[0, CH / 2, s * (CH / 2 - T / 2)]} castShadow>
            <boxGeometry args={[CHANNEL_LENGTH, CH, T]} />
            <Mat color="#a7b2bc" hovered={on} mode={mode} />
          </mesh>
          <mesh position={[0, CH - T / 2, s * (CH / 2 - 0.05)]} castShadow>
            <boxGeometry args={[CHANNEL_LENGTH, T, 0.1]} />
            <Mat color="#a7b2bc" hovered={on} mode={mode} />
          </mesh>
          {mode === "render"
            ? slots.map((x) => (
                <mesh key={x} position={[x, CH * 0.45, s * (CH / 2 + 0.001)]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
                  <planeGeometry args={[0.14, 0.06]} />
                  <meshBasicMaterial color="#0b0f14" />
                </mesh>
              ))
            : null}
        </group>
      ))}
      {on ? <Label id="channel" position={[0, -0.45, 0]} /> : null}
    </group>
  );
}

function Rod({ id, x, hovered, mode, hover }: PartProps & { id: PartId; x: number }) {
  const ref = useAssembly(0.75 + (x > 0 ? 0.15 : 0), [0, 3.5, 0]);
  const on = hovered === id;
  const threads = useMemo(() => Array.from({ length: 34 }, (_, i) => -0.25 + i * ((ROD_TOP + 0.25) / 33)), []);
  return (
    <group ref={ref} onPointerOver={hover(id)} onPointerOut={hover(null)}>
      <mesh position={[x, (ROD_TOP - 0.3) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, ROD_TOP + 0.3, 12]} />
        <Mat color="#c3ccd4" hovered={on} mode={mode} metal={0.9} rough={0.25} />
      </mesh>
      {mode === "render"
        ? threads.map((y) => (
            <mesh key={y} position={[x, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.052, 0.008, 4, 14]} />
              <Mat color="#aeb8c1" hovered={on} mode={mode} metal={0.9} rough={0.3} />
            </mesh>
          ))
        : null}
      {[-0.06, CH + 0.06].map((y) => (
        <mesh key={y} position={[x, y, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.08, 6]} />
          <Mat color="#d7dde2" hovered={on} mode={mode} metal={0.95} rough={0.2} />
        </mesh>
      ))}
      <mesh position={[x, ROD_TOP, 0]} castShadow>
        <boxGeometry args={[0.42, 0.06, 0.42]} />
        <Mat color="#7d8893" hovered={on} mode={mode} />
      </mesh>
      {on ? <Label id={id} position={[x, ROD_TOP * 0.6, 0]} /> : null}
    </group>
  );
}

function FlowPulses({ r, color }: { r: number; color: string }) {
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  const count = 4;
  useFrame(({ clock }) => {
    refs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const p = ((clock.elapsedTime * 0.22 + i / count) % 1) - 0.5;
      mesh.position.z = p * PIPE_LENGTH;
      const m = mesh.material as THREE.MeshBasicMaterial;
      m.opacity = 0.75 * Math.sin((p + 0.5) * Math.PI);
    });
  });
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} ref={(m) => { refs.current[i] = m; }}>
          <torusGeometry args={[r + 0.006, 0.012, 6, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

function Pipe({ id, x, r, color, index, hovered, mode, hover }: PartProps & { id: PartId; x: number; r: number; color: string; index: number }) {
  const pipeRef = useAssembly(1.35 + index * 0.22, [0, 0, -9]);
  const clampRef = useAssembly(2.1 + index * 0.18, [0, 1.6, 0]);
  const on = hovered === id;
  const y = CH + 0.06 + r;
  return (
    <group onPointerOver={hover(id)} onPointerOut={hover(null)}>
      <group ref={pipeRef}>
        <mesh position={[x, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[r, r, PIPE_LENGTH, 48, 1, true]} />
          <Mat color={color} hovered={on} mode={mode} metal={0.55} rough={0.4} />
        </mesh>
        <group position={[x, y, 0]}>
          <FlowPulses r={r} color={mode === "cad" ? "#ffffff" : "#3fd0ff"} />
        </group>
      </group>
      <group ref={clampRef}>
        <mesh position={[x, y, 0]}>
          <torusGeometry args={[r + 0.035, 0.035, 12, 64]} />
          <Mat color="#d9dfe4" hovered={on} mode={mode} metal={0.95} rough={0.18} />
        </mesh>
        <mesh position={[x, y, 0]}>
          <torusGeometry args={[r + 0.008, 0.016, 8, 64]} />
          <Mat color="#15191e" hovered={on} mode={mode} metal={0} rough={0.9} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[x + s * 0.07, y + r + 0.08, 0]}>
            <boxGeometry args={[0.05, 0.14, 0.08]} />
            <Mat color="#d9dfe4" hovered={on} mode={mode} metal={0.95} rough={0.2} />
          </mesh>
        ))}
        <mesh position={[x, y + r + 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.022, 0.022, 0.26, 8]} />
          <Mat color="#eef1f3" hovered={on} mode={mode} metal={1} rough={0.15} />
        </mesh>
        <mesh position={[x, CH + 0.03, 0]}>
          <boxGeometry args={[0.12, 0.06, 0.12]} />
          <Mat color="#c9d0d6" hovered={on} mode={mode} />
        </mesh>
      </group>
      {on ? <Label id={id} position={[x, y + r + 0.55, 0]} /> : null}
    </group>
  );
}

function Dimension({ mode }: { mode: SceneMode }) {
  const ref = useAssembly(2.9, [0, 0.6, 0]);
  const [ready, setReady] = useState(false);
  useFrame(({ clock }) => {
    if (!ready && clock.elapsedTime > 3.6) setReady(true);
  });
  const y = -0.42;
  const z = CH / 2 + 0.35;
  const half = CHANNEL_LENGTH / 2;
  const color = mode === "cad" ? "#ffffff" : "#3fd0ff";
  return (
    <group ref={ref}>
      <Line points={[[-half, y, z], [half, y, z]]} color={color} lineWidth={1} transparent opacity={0.8} />
      <Line points={[[-half, y - 0.1, z], [-half, 0, z]]} color={color} lineWidth={1} transparent opacity={0.8} />
      <Line points={[[half, y - 0.1, z], [half, 0, z]]} color={color} lineWidth={1} transparent opacity={0.8} />
      {ready ? (
        <Html position={[0, y - 0.18, z]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
          <span className="whitespace-nowrap font-mono text-[11px] tracking-[0.2em] text-cyan">1200 MM</span>
        </Html>
      ) : null}
    </group>
  );
}

function Rig({ mode }: { mode: SceneMode }) {
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<PartId | null>(null);
  const hover = (id: PartId | null) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(id);
    document.body.style.cursor = id ? "pointer" : "";
  };
  useFrame(({ clock, pointer }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    const targetY = -0.55 + Math.sin(t * 0.18) * 0.35 + pointer.x * 0.35;
    const targetX = 0.12 - pointer.y * 0.12;
    group.current.rotation.y += (targetY - group.current.rotation.y) * 0.04;
    group.current.rotation.x += (targetX - group.current.rotation.x) * 0.04;
  });
  const props = { hovered, mode, hover };
  return (
    <group ref={group} position={[0, -1.1, 0]}>
      <Channel {...props} />
      <Rod id="rodL" x={-ROD_X} {...props} />
      <Rod id="rodR" x={ROD_X} {...props} />
      {PIPES.map((p, i) => <Pipe key={p.id} {...p} index={i} {...props} />)}
      <Dimension mode={mode} />
    </group>
  );
}

export default function PipeSupportScene({ mode, active }: { mode: SceneMode; active: boolean }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [5.2, 2.6, 6.4], fov: 34 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onPointerMissed={() => { document.body.style.cursor = ""; }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 8, 5]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-4, 1, 3]} intensity={18} color="#3fd0ff" distance={12} />
      <pointLight position={[4, -1, -3]} intensity={14} color="#e21f26" distance={10} />
      <Environment resolution={128}>
        <Lightformer intensity={2.2} position={[0, 5, -6]} scale={[12, 4, 1]} />
        <Lightformer intensity={1.2} position={[-6, 2, 2]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} color="#9fe6ff" />
        <Lightformer intensity={0.8} position={[6, 1, 2]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} color="#ffd2d2" />
      </Environment>
      <Rig mode={mode} />
      <Grid
        position={[0, -1.75, 0]}
        args={[30, 30]}
        cellSize={0.25}
        cellThickness={0.5}
        cellColor="#14394a"
        sectionSize={1}
        sectionThickness={1}
        sectionColor="#1f6f8f"
        fadeDistance={16}
        fadeStrength={1.5}
        infiniteGrid
      />
    </Canvas>
  );
}
