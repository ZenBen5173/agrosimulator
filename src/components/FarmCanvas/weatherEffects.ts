import { Application, Graphics, Container } from "pixi.js";

export class WeatherLayer {
  private app: Application;
  private container: Container;
  private condition: string;
  private destroyed = false;
  private timeouts: ReturnType<typeof setTimeout>[] = [];

  constructor(app: Application, condition: string) {
    this.app = app;
    this.condition = condition;
    this.container = new Container();
    app.stage.addChild(this.container);

    // Skip animations on low-end devices
    const cores =
      typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
    if (cores <= 2) {
      this.applyStaticOnly();
      return;
    }

    this.apply();
  }

  private applyStaticOnly() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    switch (this.condition) {
      case "overcast": {
        const overlay = new Graphics();
        overlay.rect(0, 0, w, h);
        overlay.fill({ color: 0x888888, alpha: 0.2 });
        this.container.addChild(overlay);
        break;
      }
      case "rainy":
      case "thunderstorm": {
        const overlay = new Graphics();
        overlay.rect(0, 0, w, h);
        overlay.fill({
          color: this.condition === "thunderstorm" ? 0x1a1a2e : 0x607d8b,
          alpha: this.condition === "thunderstorm" ? 0.35 : 0.2,
        });
        this.container.addChild(overlay);
        break;
      }
      case "drought": {
        const overlay = new Graphics();
        overlay.rect(0, 0, w, h);
        overlay.fill({ color: 0xd4a373, alpha: 0.15 });
        this.container.addChild(overlay);
        break;
      }
      case "flood_risk": {
        const water = new Graphics();
        water.rect(0, h * 0.8, w, h * 0.2);
        water.fill({ color: 0x4fc3f7, alpha: 0.3 });
        this.container.addChild(water);
        break;
      }
    }
  }

  private apply() {
    switch (this.condition) {
      case "sunny":
        this.applySunny();
        break;
      case "overcast":
        this.applyOvercast();
        break;
      case "rainy":
        this.applyRainy();
        break;
      case "thunderstorm":
        this.applyThunderstorm();
        break;
      case "drought":
        this.applyDrought();
        break;
      case "flood_risk":
        this.applyFloodRisk();
        break;
    }
  }

  private applySunny() {
    const w = this.app.screen.width;

    // Sun sprite: yellow circle + rays in top-right
    const sun = new Graphics();
    const cx = w - 50;
    const cy = 50;
    const r = 16;

    // Rays
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const x1 = cx + Math.cos(angle) * (r + 4);
      const y1 = cy + Math.sin(angle) * (r + 4);
      const x2 = cx + Math.cos(angle) * (r + 12);
      const y2 = cy + Math.sin(angle) * (r + 12);
      sun.moveTo(x1, y1);
      sun.lineTo(x2, y2);
      sun.stroke({ color: 0xffd700, width: 2, alpha: 0.8 });
    }

    // Circle
    sun.circle(cx, cy, r);
    sun.fill({ color: 0xffd700, alpha: 0.9 });

    this.container.addChild(sun);

    // Slow rotation
    let angle = 0;
    this.app.ticker.add(() => {
      if (this.destroyed) return;
      angle += 0.005;
      sun.rotation = angle;
      sun.pivot.set(cx, cy);
      sun.position.set(cx, cy);
    });
  }

  private applyOvercast() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // Grey overlay
    const overlay = new Graphics();
    overlay.rect(0, 0, w, h);
    overlay.fill({ color: 0x888888, alpha: 0.2 });
    this.container.addChild(overlay);

    // Drifting cloud
    const cloud = new Graphics();
    cloud.roundRect(0, 0, 100, 30, 15);
    cloud.fill({ color: 0xffffff, alpha: 0.3 });
    cloud.roundRect(20, -15, 60, 30, 15);
    cloud.fill({ color: 0xffffff, alpha: 0.25 });
    cloud.y = h * 0.15;
    cloud.x = -120;
    this.container.addChild(cloud);

    this.app.ticker.add(() => {
      if (this.destroyed) return;
      cloud.x += 0.3;
      if (cloud.x > w + 20) cloud.x = -120;
    });
  }

  private applyRainy() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // Slight blue tint overlay
    const overlay = new Graphics();
    overlay.rect(0, 0, w, h);
    overlay.fill({ color: 0x607d8b, alpha: 0.15 });
    this.container.addChild(overlay);

    // Rain particles
    const rainContainer = new Container();
    this.container.addChild(rainContainer);

    const particles: { g: Graphics; x: number; y: number; speed: number }[] =
      [];
    const count = 250;

    for (let i = 0; i < count; i++) {
      const g = new Graphics();
      g.moveTo(0, 0);
      g.lineTo(-3, 15);
      g.stroke({ color: 0xffffff, width: 1.5, alpha: 0.5 });
      g.x = Math.random() * (w + 100) - 50;
      g.y = Math.random() * h - h;
      rainContainer.addChild(g);

      particles.push({
        g,
        x: g.x,
        y: g.y,
        speed: 4 + Math.random() * 3,
      });
    }

    this.app.ticker.add(() => {
      if (this.destroyed) return;
      for (const p of particles) {
        p.y += p.speed;
        p.x -= p.speed * 0.2;
        if (p.y > h) {
          p.y = -20;
          p.x = Math.random() * (w + 100) - 50;
        }
        p.g.x = p.x;
        p.g.y = p.y;
      }
    });
  }

  private applyThunderstorm() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // Dark overlay
    const dark = new Graphics();
    dark.rect(0, 0, w, h);
    dark.fill({ color: 0x1a1a2e, alpha: 0.35 });
    this.container.addChild(dark);

    // Rain (reuse rain logic, fewer particles)
    const rainContainer = new Container();
    this.container.addChild(rainContainer);

    const particles: { g: Graphics; x: number; y: number; speed: number }[] =
      [];
    const count = 200;

    for (let i = 0; i < count; i++) {
      const g = new Graphics();
      g.moveTo(0, 0);
      g.lineTo(-4, 18);
      g.stroke({ color: 0xccccee, width: 1.5, alpha: 0.6 });
      g.x = Math.random() * (w + 100) - 50;
      g.y = Math.random() * h - h;
      rainContainer.addChild(g);
      particles.push({ g, x: g.x, y: g.y, speed: 5 + Math.random() * 4 });
    }

    this.app.ticker.add(() => {
      if (this.destroyed) return;
      for (const p of particles) {
        p.y += p.speed;
        p.x -= p.speed * 0.25;
        if (p.y > h) {
          p.y = -20;
          p.x = Math.random() * (w + 100) - 50;
        }
        p.g.x = p.x;
        p.g.y = p.y;
      }
    });

    // Lightning flash
    const flash = new Graphics();
    flash.rect(0, 0, w, h);
    flash.fill({ color: 0xffffff, alpha: 0 });
    this.container.addChild(flash);

    const doFlash = () => {
      if (this.destroyed) return;
      flash.alpha = 0.7;
      let fadeStep = 0;
      const fadeTicker = () => {
        fadeStep++;
        flash.alpha = Math.max(0, 0.7 - fadeStep * 0.12);
        if (flash.alpha <= 0) {
          this.app.ticker.remove(fadeTicker);
        }
      };
      this.app.ticker.add(fadeTicker);

      // Next flash in 8-15s
      const next = setTimeout(doFlash, 8000 + Math.random() * 7000);
      this.timeouts.push(next);
    };

    const firstFlash = setTimeout(doFlash, 3000 + Math.random() * 5000);
    this.timeouts.push(firstFlash);
  }

  private applyDrought() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // Orange-brown overlay
    const overlay = new Graphics();
    overlay.rect(0, 0, w, h);
    overlay.fill({ color: 0xd4a373, alpha: 0.15 });
    this.container.addChild(overlay);
  }

  private applyFloodRisk() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // Water overlay at bottom
    const water = new Graphics();
    water.rect(0, h * 0.8, w, h * 0.2);
    water.fill({ color: 0x4fc3f7, alpha: 0.3 });
    this.container.addChild(water);

    // Oscillating alpha
    let time = 0;
    this.app.ticker.add(() => {
      if (this.destroyed) return;
      time += 0.03;
      water.alpha = 0.3 + Math.sin(time) * 0.1;
    });
  }

  destroy() {
    this.destroyed = true;
    for (const t of this.timeouts) clearTimeout(t);
    this.timeouts = [];
    this.container.destroy({ children: true });
  }
}
