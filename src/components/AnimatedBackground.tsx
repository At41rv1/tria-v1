import { useRef, useEffect } from "react";

class Grad {
  constructor(x: number, y: number, z: number) {
    this.x = x; 
    this.y = y; 
    this.z = z;
  }
  x: number;
  y: number;
  z: number;
  dot2(x: number, y: number): number { 
    return this.x * x + this.y * y; 
  }
}

class Noise {
  grad3: Grad[];
  p: number[];
  perm: number[];
  gradP: Grad[];

  constructor(seed = 0) {
    this.grad3 = [
      new Grad(1, 1, 0), new Grad(-1, 1, 0), new Grad(1, -1, 0), new Grad(-1, -1, 0),
      new Grad(1, 0, 1), new Grad(-1, 0, 1), new Grad(1, 0, -1), new Grad(-1, 0, -1),
      new Grad(0, 1, 1), new Grad(0, -1, 1), new Grad(0, 1, -1), new Grad(0, -1, -1)
    ];
    this.p = [151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30,
      69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219,
      203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74,
      165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105,
      92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208,
      89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217,
      226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17,
      182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167,
      43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246,
      97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239,
      107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254,
      138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180
    ];
    this.perm = new Array(512);
    this.gradP = new Array(512);
    this.seed(seed);
  }

  seed(seed: number) {
    if (seed > 0 && seed < 1) seed *= 65536;
    seed = Math.floor(seed);
    if (seed < 256) seed |= seed << 8;
    for (let i = 0; i < 256; i++) {
      let v = (i & 1) ? (this.p[i] ^ (seed & 255)) : (this.p[i] ^ ((seed >> 8) & 255));
      this.perm[i] = this.perm[i + 256] = v;
      this.gradP[i] = this.gradP[i + 256] = this.grad3[v % 12];
    }
  }

  fade(t: number): number { 
    return t * t * t * (t * (t * 6 - 15) + 10); 
  }

  lerp(a: number, b: number, t: number): number { 
    return (1 - t) * a + t * b; 
  }

  perlin2(x: number, y: number): number {
    let X = Math.floor(x), Y = Math.floor(y);
    x -= X; y -= Y; X &= 255; Y &= 255;
    const n00 = this.gradP[X + this.perm[Y]].dot2(x, y);
    const n01 = this.gradP[X + this.perm[Y + 1]].dot2(x, y - 1);
    const n10 = this.gradP[X + 1 + this.perm[Y]].dot2(x - 1, y);
    const n11 = this.gradP[X + 1 + this.perm[Y + 1]].dot2(x - 1, y - 1);
    const u = this.fade(x);
    return this.lerp(
      this.lerp(n00, n10, u),
      this.lerp(n01, n11, u),
      this.fade(y)
    );
  }
}

interface Point {
  x: number;
  y: number;
  wave: { x: number; y: number };
  cursor: { x: number; y: number; vx: number; vy: number };
}

interface MouseState {
  x: number;
  y: number;
  lx: number;
  ly: number;
  sx: number;
  sy: number;
  v: number;
  vs: number;
  a: number;
  set: boolean;
}

interface AnimatedBackgroundProps {
  className?: string;
  style?: React.CSSProperties;
}

const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({ 
  className = "", 
  style = {} 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const boundingRef = useRef({ width: 0, height: 0, left: 0, top: 0 });
  const noiseRef = useRef(new Noise(Math.random()));
  const linesRef = useRef<Point[][]>([]);
  const mouseRef = useRef<MouseState>({
    x: -10, y: 0, lx: 0, ly: 0, sx: 0, sy: 0, v: 0, vs: 0, a: 0, set: false
  });
  const frameIdRef = useRef<number | null>(null);

  // Optimized configuration for performance and light appearance
  const config = {
    lineColor: "rgba(156, 163, 175, 0.25)", // Very light grey lines
    waveSpeedX: 0.008, // Reduced for better performance
    waveSpeedY: 0.005, // Reduced for better performance
    waveAmpX: 20, // Reduced amplitude
    waveAmpY: 15, // Reduced amplitude
    friction: 0.94,
    tension: 0.003,
    maxCursorMove: 60,
    xGap: 16, // Increased gap for fewer points
    yGap: 40, // Increased gap for fewer points
    autoWaveIntensity: 0.8, // Reduced intensity
    autoWaveSpeed: 0.001 // Slower auto wave
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    
    if (!canvas || !container) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctxRef.current = ctx;

    function setSize() {
      if (!container || !canvas) return;
      boundingRef.current = container.getBoundingClientRect();
      canvas.width = boundingRef.current.width;
      canvas.height = boundingRef.current.height;
    }

    function setLines() {
      const { width, height } = boundingRef.current;
      linesRef.current = [];
      const oWidth = width + 100; // Reduced padding
      const oHeight = height + 50; // Reduced padding
      const { xGap, yGap } = config;
      const totalLines = Math.ceil(oWidth / xGap);
      const totalPoints = Math.ceil(oHeight / yGap);
      const xStart = (width - xGap * totalLines) / 2;
      const yStart = (height - yGap * totalPoints) / 2;
      
      for (let i = 0; i <= totalLines; i++) {
        const pts: Point[] = [];
        for (let j = 0; j <= totalPoints; j++) {
          pts.push({
            x: xStart + xGap * i,
            y: yStart + yGap * j,
            wave: { x: 0, y: 0 },
            cursor: { x: 0, y: 0, vx: 0, vy: 0 }
          });
        }
        linesRef.current.push(pts);
      }
    }

    function movePoints(time: number) {
      const lines = linesRef.current;
      const mouse = mouseRef.current;
      const noise = noiseRef.current;
      const { 
        waveSpeedX, 
        waveSpeedY, 
        waveAmpX, 
        waveAmpY, 
        friction, 
        tension, 
        maxCursorMove,
        autoWaveIntensity,
        autoWaveSpeed
      } = config;
      
      lines.forEach((pts) => {
        pts.forEach((p) => {
          // Optimized wave motion
          const baseMove = noise.perlin2(
            (p.x + time * waveSpeedX) * 0.001, // Reduced frequency
            (p.y + time * waveSpeedY) * 0.001  // Reduced frequency
          ) * 8; // Reduced multiplier
          
          // Lighter automatic wave motion
          const autoWaveX = Math.sin(time * autoWaveSpeed + p.x * 0.005) * autoWaveIntensity;
          const autoWaveY = Math.cos(time * autoWaveSpeed + p.y * 0.005) * autoWaveIntensity;
          
          p.wave.x = Math.cos(baseMove) * waveAmpX + autoWaveX;
          p.wave.y = Math.sin(baseMove) * waveAmpY + autoWaveY;

          // Optimized mouse interaction
          const dx = p.x - mouse.sx;
          const dy = p.y - mouse.sy;
          const dist = Math.hypot(dx, dy);
          const l = Math.max(120, mouse.vs); // Reduced interaction radius
          
          if (dist < l) {
            const s = 1 - dist / l;
            const f = Math.cos(dist * 0.005) * s; // Reduced frequency
            p.cursor.vx += Math.cos(mouse.a) * f * l * mouse.vs * 0.0003; // Reduced force
            p.cursor.vy += Math.sin(mouse.a) * f * l * mouse.vs * 0.0003; // Reduced force
          }

          p.cursor.vx += (0 - p.cursor.x) * tension;
          p.cursor.vy += (0 - p.cursor.y) * tension;
          p.cursor.vx *= friction;
          p.cursor.vy *= friction;
          p.cursor.x += p.cursor.vx;
          p.cursor.y += p.cursor.vy;
          p.cursor.x = Math.min(maxCursorMove, Math.max(-maxCursorMove, p.cursor.x));
          p.cursor.y = Math.min(maxCursorMove, Math.max(-maxCursorMove, p.cursor.y));
        });
      });
    }

    function moved(point: Point, withCursor = true) {
      const x = point.x + point.wave.x + (withCursor ? point.cursor.x : 0);
      const y = point.y + point.wave.y + (withCursor ? point.cursor.y : 0);
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    }

    function drawLines() {
      const { width, height } = boundingRef.current;
      const ctx = ctxRef.current;
      if (!ctx) return;
      
      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();
      ctx.strokeStyle = config.lineColor;
      ctx.lineWidth = 1; // Thinner lines
      
      linesRef.current.forEach((points) => {
        if (points.length === 0) return;
        
        let p1 = moved(points[0], false);
        ctx.moveTo(p1.x, p1.y);
        
        points.forEach((p, idx) => {
          const isLast = idx === points.length - 1;
          p1 = moved(p, !isLast);
          ctx.lineTo(p1.x, p1.y);
          
          if (isLast && points[points.length - 1]) {
            const p2 = moved(points[points.length - 1], !isLast);
            ctx.moveTo(p2.x, p2.y);
          }
        });
      });
      
      ctx.stroke();
    }

    let lastTime = 0;
    function tick(t: number) {
      // Throttle to 30fps for better performance
      if (t - lastTime < 33) {
        frameIdRef.current = requestAnimationFrame(tick);
        return;
      }
      lastTime = t;

      const mouse = mouseRef.current;
      mouse.sx += (mouse.x - mouse.sx) * 0.06; // Slower interpolation
      mouse.sy += (mouse.y - mouse.sy) * 0.06;
      
      const dx = mouse.x - mouse.lx;
      const dy = mouse.y - mouse.ly;
      const d = Math.hypot(dx, dy);
      mouse.v = d;
      mouse.vs += (d - mouse.vs) * 0.06;
      mouse.vs = Math.min(60, mouse.vs); // Reduced max velocity
      mouse.lx = mouse.x;
      mouse.ly = mouse.y;
      mouse.a = Math.atan2(dy, dx);

      movePoints(t);
      drawLines();
      frameIdRef.current = requestAnimationFrame(tick);
    }

    function onResize() {
      setSize();
      setLines();
    }

    function onMouseMove(e: MouseEvent) { 
      updateMouse(e.clientX, e.clientY); 
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) {
        updateMouse(touch.clientX, touch.clientY);
      }
    }

    function updateMouse(x: number, y: number) {
      const mouse = mouseRef.current;
      const b = boundingRef.current;
      mouse.x = x - b.left;
      mouse.y = y - b.top;
      
      if (!mouse.set) {
        mouse.sx = mouse.x;
        mouse.sy = mouse.y;
        mouse.lx = mouse.x;
        mouse.ly = mouse.y;
        mouse.set = true;
      }
    }

    // Initialize
    setSize();
    setLines();
    frameIdRef.current = requestAnimationFrame(tick);

    // Event listeners
    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`animated-background ${className}`}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
        ...style
      }}
    >
      <canvas 
        ref={canvasRef} 
        className="w-full h-full block"
        style={{ 
          display: "block",
          width: "100%",
          height: "100%"
        }}
      />
    </div>
  );
};

export default AnimatedBackground;