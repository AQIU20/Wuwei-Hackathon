"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useLoader } from "@react-three/fiber";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import * as THREE from "three";
import { Suspense, useRef, useMemo, useState, useCallback } from "react";

type Particle = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  rotSpeed: THREE.Vector3;
  scale: number;
  color: string;
  life: number;
};

function DebrisParticles({ particles }: { particles: Particle[] }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((_, delta) => {
    particles.forEach((p, i) => {
      const mesh = refs.current[i];
      if (!mesh || p.life <= 0) return;
      p.velocity.y -= 9.8 * delta;
      p.position.add(p.velocity.clone().multiplyScalar(delta));
      p.rotation.x += p.rotSpeed.x * delta;
      p.rotation.y += p.rotSpeed.y * delta;
      p.rotation.z += p.rotSpeed.z * delta;
      p.life -= delta;

      mesh.position.copy(p.position);
      mesh.rotation.copy(p.rotation);
      mesh.scale.setScalar(p.scale * Math.max(0, p.life / 2));
      (mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, p.life / 2);
    });
  });

  return (
    <>
      {particles.map((p, i) => (
        <mesh
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          position={p.position.clone()}
          rotation={p.rotation.clone()}
        >
          <boxGeometry args={[0.08, 0.08, 0.08]} />
          <meshStandardMaterial
            color={p.color}
            emissive={p.color}
            emissiveIntensity={0.5}
            transparent
            opacity={1}
          />
        </mesh>
      ))}
    </>
  );
}

function StlModel({ onSpawnDebris }: { onSpawnDebris: () => void }) {
  const geometry = useLoader(STLLoader, "/logo.stl");
  const meshRef = useRef<THREE.Mesh>(null);

  // Center geometry on load
  const centeredGeometry = useMemo(() => {
    const geo = geometry.clone();
    geo.computeBoundingBox();
    geo.center();
    geo.computeVertexNormals();
    return geo;
  }, [geometry]);

  // Gradient metallic shader
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color("#ff6c37") },
        uColor2: { value: new THREE.Color("#ffd4bd") },
        uColor3: { value: new THREE.Color("#ffffff") },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        void main() {
          float t = sin(vPosition.y * 0.02 + uTime * 0.5) * 0.5 + 0.5;
          float t2 = sin(vPosition.x * 0.015 + uTime * 0.3) * 0.5 + 0.5;
          vec3 baseColor = mix(mix(uColor1, uColor2, t), uColor3, t2 * 0.5);
          vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
          float diff = max(dot(vNormal, lightDir), 0.0);
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          vec3 halfDir = normalize(lightDir + viewDir);
          float spec = pow(max(dot(vNormal, halfDir), 0.0), 64.0);
          float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);
          vec3 color = baseColor * (0.3 + diff * 0.5) + vec3(1.0) * spec * 0.6 + uColor1 * fresnel * 0.4;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
  }, []);

  // Compute proper scale from bounding box
  const scale = useMemo(() => {
    centeredGeometry.computeBoundingBox();
    const box = centeredGeometry.boundingBox!;
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    return 2.5 / maxDim;
  }, [centeredGeometry]);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.25;
    }
    material.uniforms.uTime.value += delta;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={centeredGeometry}
      material={material}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        onSpawnDebris();
      }}
    />
  );
}

function Scene() {
  const [particles, setParticles] = useState<Particle[]>([]);

  const spawnDebris = useCallback(() => {
    const colors = ["#ff6c37", "#ffd4bd", "#ffffff", "#ff9a6c", "#d4d4d8"];
    const newParticles: Particle[] = Array.from({ length: 25 }, (_, i) => ({
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        0.6 + Math.random() * 0.6,
        (Math.random() - 0.5) * 0.6,
      ),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        -(Math.random() * 0.5 + 0.2),
        (Math.random() - 0.5) * 0.4,
      ),
      rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, 0),
      rotSpeed: new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3,
      ),
      scale: 0.15 + Math.random() * 0.35,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 2 + Math.random() * 1.5,
    }));
    setParticles(newParticles);
    setTimeout(() => setParticles([]), 4000);
  }, []);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 3, 5]} intensity={0.8} color="#ff6c37" />
      <directionalLight position={[-3, 2, 3]} intensity={0.5} color="#ffd4bd" />
      <StlModel onSpawnDebris={spawnDebris} />
      {particles.length > 0 && <DebrisParticles particles={particles} />}
    </>
  );
}

export function Logo3D() {
  return (
    <div className="h-48 w-48 cursor-pointer md:h-56 md:w-56">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 40 }}
        style={{ background: "transparent" }}
        gl={{ alpha: true, antialias: true }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
