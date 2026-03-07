import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export async function loadStlToMesh(file: File): Promise<THREE.Mesh> {
  const arrayBuffer = await file.arrayBuffer();
  const loader = new STLLoader();
  const geom = loader.parse(arrayBuffer);
  geom.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x9ca3af,
    metalness: 0.1,
    roughness: 0.9,
  });
  const mesh = new THREE.Mesh(geom, material);
  mesh.rotation.x = -Math.PI / 2;

  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  mesh.position.sub(center);

  return mesh;
}

export function useThreeCanvas(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    light: THREE.DirectionalLight;
    ambient: THREE.AmbientLight;
    mesh: THREE.Object3D | null;
    raf: number;
  } | null>(null);

  const api = useMemo(() => {
    return {
      setMesh(mesh: THREE.Object3D) {
        const s = stateRef.current;
        if (!s) return;
        if (s.mesh) s.scene.remove(s.mesh);
        s.mesh = mesh;
        s.scene.add(mesh);
      },
      fitToObject(obj?: THREE.Object3D | null) {
        const s = stateRef.current;
        if (!s) return;
        const target = obj || s.mesh;
        if (!target) return;

        const box = new THREE.Box3().setFromObject(target);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const maxSize = Math.max(size.x, size.y, size.z) || 1;
        const fov = (s.camera.fov * Math.PI) / 180;
        const distance = maxSize / (2 * Math.tan(fov / 2));

        s.controls.target.copy(center);
        s.camera.position.set(
          center.x,
          center.y + distance * 1.1,
          center.z + distance * 1.1
        );
        s.camera.near = Math.max(distance / 100, 0.01);
        s.camera.far = distance * 100;
        s.camera.updateProjectionMatrix();
        s.controls.update();
      },
      disposeMesh() {
        const s = stateRef.current;
        if (!s?.mesh) return;
        const m = s.mesh as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (Array.isArray(m.material))
          m.material.forEach((x: THREE.Material) => x.dispose());
        else if (m.material) m.material.dispose();
        s.scene.remove(s.mesh);
        s.mesh = null;
      },
      resize() {
        const s = stateRef.current;
        const canvas = canvasRef.current;
        if (!s || !canvas) return;
        const w = canvas.clientWidth || 1;
        const h = canvas.clientHeight || 1;
        s.renderer.setSize(w, h, false);
        s.camera.aspect = w / h;
        s.camera.updateProjectionMatrix();
      },
    };
  }, [canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 120, 140);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const light = new THREE.DirectionalLight(0xffffff, 0.8);
    light.position.set(100, 200, 100);

    scene.add(ambient);
    scene.add(light);

    const grid = new THREE.GridHelper(200, 20, 0xd1d5db, 0xe5e7eb);
    scene.add(grid);

    const s = {
      renderer,
      scene,
      camera,
      controls,
      light,
      ambient,
      mesh: null as THREE.Object3D | null,
      raf: 0,
    };
    stateRef.current = s;

    const onResize = () => api.resize();
    window.addEventListener("resize", onResize);
    api.resize();

    const animate = () => {
      s.raf = window.requestAnimationFrame(animate);
      s.controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener("resize", onResize);
      window.cancelAnimationFrame(s.raf);
      renderer.dispose();
      stateRef.current = null;
    };
  }, [api, canvasRef]);

  return api;
}
