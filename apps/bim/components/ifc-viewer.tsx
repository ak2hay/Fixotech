"use client";

import { useEffect, useRef, useState } from "react";
import { API_URL } from "../lib/api";

export function IfcViewer({ documentId, version }: { documentId: string; version?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Loading the IFC model...");
  const [error, setError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const surface = canvas;
    let disposed = false;
    let renderer: import("three").WebGLRenderer | undefined;
    let frame = 0;

    async function run() {
      try {
        const query = version ? `?version=${encodeURIComponent(version)}` : "";
        const response = await fetch(`${API_URL}/api/v1/documents/${documentId}/download${query}`, { credentials: "same-origin" });
        if (!response.ok) throw new Error(response.status === 404 ? "No IFC file is available for this revision." : "The IFC file could not be downloaded.");
        const buffer = new Uint8Array(await response.arrayBuffer());
        if (disposed) return;

        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const { IfcAPI } = await import("web-ifc");

        const ifc = new IfcAPI();
        ifc.SetWasmPath("/ifc/", true);
        await ifc.Init();
        if (disposed) {
          ifc.Dispose();
          return;
        }
        const modelId = ifc.OpenModel(buffer);
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf4f2ee);
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
        camera.position.set(12, 10, 16);
        renderer = new THREE.WebGLRenderer({ canvas: surface, antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const sun = new THREE.DirectionalLight(0xffffff, 1.1);
        sun.position.set(20, 40, 10);
        scene.add(sun);

        const group = new THREE.Group();
        ifc.StreamAllMeshes(modelId, (mesh) => {
          const count = mesh.geometries.size();
          for (let index = 0; index < count; index += 1) {
            const part = mesh.geometries.get(index);
            const geometry = ifc.GetGeometry(modelId, part.geometryExpressID);
            const vertexData = ifc.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
            const indexData = ifc.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
            const positions = new Float32Array(vertexData.length / 2);
            const normals = new Float32Array(vertexData.length / 2);
            for (let i = 0, j = 0; i < vertexData.length; i += 6, j += 3) {
              positions[j] = vertexData[i];
              positions[j + 1] = vertexData[i + 1];
              positions[j + 2] = vertexData[i + 2];
              normals[j] = vertexData[i + 3];
              normals[j + 1] = vertexData[i + 4];
              normals[j + 2] = vertexData[i + 5];
            }
            const bufferGeometry = new THREE.BufferGeometry();
            bufferGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
            bufferGeometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
            bufferGeometry.setIndex(new THREE.BufferAttribute(indexData, 1));
            const color = part.color;
            const material = new THREE.MeshLambertMaterial({
              color: new THREE.Color(color.x, color.y, color.z),
              opacity: color.w,
              transparent: color.w < 0.99,
              side: THREE.DoubleSide,
            });
            const object = new THREE.Mesh(bufferGeometry, material);
            object.matrix = new THREE.Matrix4().fromArray(part.flatTransformation);
            object.matrixAutoUpdate = false;
            group.add(object);
            geometry.delete();
          }
        });
        scene.add(group);

        const box = new THREE.Box3().setFromObject(group);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3()).length();
          group.position.sub(center);
          camera.position.set(size * 0.6, size * 0.45, size * 0.7);
          camera.lookAt(0, 0, 0);
          camera.near = Math.max(size / 1000, 0.05);
          camera.far = size * 20;
          camera.updateProjectionMatrix();
        }

        const controls = new OrbitControls(camera, surface);
        controls.enableDamping = true;

        const resize = () => {
          if (!renderer || !surface.parentElement) return;
          const { clientWidth, clientHeight } = surface.parentElement;
          const width = Math.max(clientWidth, 1);
          const height = Math.max(clientHeight, 1);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        };
        resize();
        window.addEventListener("resize", resize);

        const tick = () => {
          if (disposed) return;
          controls.update();
          renderer?.render(scene, camera);
          frame = requestAnimationFrame(tick);
        };
        tick();
        setStatus("");
        ifc.CloseModel(modelId);

        return () => {
          window.removeEventListener("resize", resize);
          cancelAnimationFrame(frame);
          controls.dispose();
          group.traverse((item) => {
            const mesh = item as import("three").Mesh;
            mesh.geometry?.dispose();
            const material = mesh.material;
            if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
            else material?.dispose?.();
          });
          renderer?.dispose();
          ifc.Dispose();
        };
      } catch (failure) {
        if (!disposed) setError((failure as Error).message || "The IFC model could not be opened.");
      }
    }

    const cleanup = run();
    return () => {
      disposed = true;
      void cleanup.then((fn) => fn?.());
    };
  }, [documentId, version]);

  return (
    <div className="relative min-h-[28rem] overflow-hidden rounded-xl border border-line bg-canvas">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {status || error ? (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className={error ? "text-sm text-accent" : "text-sm text-muted"}>{error || status}</p>
        </div>
      ) : null}
    </div>
  );
}
