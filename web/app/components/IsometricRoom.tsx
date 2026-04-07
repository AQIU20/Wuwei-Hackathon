"use client";

/**
 * 3D Room embedded via iframe — based on github.com/BhaskarAcharjee/3D-Room.
 * Mouse-interactive CSS 3D room with furniture, lighting, and perspective shifts.
 */
export function IsometricRoom() {
  return (
    <div className="relative mx-auto w-full overflow-hidden rounded-2xl" style={{ maxWidth: 700, height: 500 }}>
      <iframe
        src="/3d-room/index.html"
        title="3D Room"
        className="h-full w-full border-0"
        loading="lazy"
      />
    </div>
  );
}
