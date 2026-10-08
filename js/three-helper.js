// NOKKA Furniture — Shared Three.js Viewer Helper

export class ThreeViewer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.fov = options.fov || 32;
    this.camZ = options.camZ || 7.2;
    this.camY = options.camY || 1.6;
    this.autoRotateSpeed = options.autoRotateSpeed !== undefined ? options.autoRotateSpeed : 0.0022;
    this.autoRotate = options.autoRotate !== undefined ? options.autoRotate : true;
    this.allowZoom = options.allowZoom !== undefined ? options.allowZoom : true;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.currentModel = null;
    this.holder = null;
    this.shadowMesh = null;

    // Interaction states
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.targetRotY = options.initRotY !== undefined ? options.initRotY : 0.4;
    this.targetRotX = options.initRotX !== undefined ? options.initRotX : 0;
    this.currentRotY = this.targetRotY;
    this.currentRotX = this.targetRotX;
    
    // Zoom/Scroll states
    this.zoomScale = 1.0;
    this.targetZoomScale = 1.0;

    // Explosion variables
    this.explodeAmount = 0.0;
    this.targetExplodeAmount = 0.0;

    // Camera flight variables
    this.cameraAnimating = false;
    this.camTargetPos = new THREE.Vector3(0, this.camY, this.camZ);
    this.camTargetLook = new THREE.Vector3(0, 0, 0);
    this.camCurrentLook = new THREE.Vector3(0, 0, 0);

    this.init();
  }

  init() {
    // 1. Scene
    this.scene = new THREE.Scene();

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.1, 100);
    this.camera.position.set(0, this.camY, this.camZ);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 4. Lights
    const keyLight = new THREE.DirectionalLight(0xfff1e0, 2.2);
    keyLight.position.set(5, 7, 5);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xabc8ff, 0.6);
    fillLight.position.set(-6, 2, -4);
    this.scene.add(fillLight);

    const ambientLight = new THREE.AmbientLight(0x352e25, 1.2);
    this.scene.add(ambientLight);

    const rimLight = new THREE.PointLight(0xb8935a, 1.8, 15);
    rimLight.position.set(0, 4, -4);
    this.scene.add(rimLight);

    // 5. Contact Shadow
    const shadowGeo = new THREE.CircleGeometry(2.1, 32);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.24
    });
    this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.y = -1.55;
    this.scene.add(this.shadowMesh);

    // 6. Model Holder Group
    this.holder = new THREE.Group();
    this.scene.add(this.holder);

    // 7. Event Listeners
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();

    this.setupEvents();
    
    // Start loop
    this.animate = this.animate.bind(this);
    this.animate();
  }

  setModel(modelGroup) {
    if (this.currentModel) {
      this.holder.remove(this.currentModel);
    }
    this.currentModel = modelGroup;
    this.currentModel.scale.setScalar(0.01);
    this.holder.add(this.currentModel);
    this.popScale = 0.01;
    this.targetExplodeAmount = 0.0;
    this.explodeAmount = 0.0;
  }

  setupEvents() {
    const down = (x, y) => {
      this.dragging = true;
      this.lastX = x;
      this.lastY = y;
    };

    const move = (x, y) => {
      if (!this.dragging) return;
      const dx = x - this.lastX;
      const dy = y - this.lastY;

      this.targetRotY += dx * 0.007;
      this.targetRotX += dy * 0.004;
      this.targetRotX = Math.max(-0.4, Math.min(0.4, this.targetRotX));

      this.lastX = x;
      this.lastY = y;
    };

    const up = () => {
      this.dragging = false;
    };

    // Mouse events
    this.canvas.addEventListener('mousedown', e => down(e.clientX, e.clientY));
    window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
    window.addEventListener('mouseup', up);

    // Touch events
    this.canvas.addEventListener('touchstart', e => {
      const t = e.touches[0];
      down(t.clientX, t.clientY);
    }, { passive: true });
    
    this.canvas.addEventListener('touchmove', e => {
      const t = e.touches[0];
      move(t.clientX, t.clientY);
    }, { passive: true });
    
    window.addEventListener('touchend', up);

    // Mouse wheel zoom
    if (this.allowZoom) {
      this.canvas.addEventListener('wheel', e => {
        e.preventDefault();
        this.targetZoomScale += e.deltaY * -0.0006;
        this.targetZoomScale = Math.max(0.6, Math.min(1.6, this.targetZoomScale));
      }, { passive: false });
    }
  }

  resize() {
    const wrap = this.canvas.parentElement;
    if (!wrap) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setExplode(amount) {
    this.targetExplodeAmount = amount;
  }

  flyTo(camPos, lookAtPos) {
    this.cameraAnimating = true;
    this.camTargetPos.copy(camPos);
    this.camTargetLook.copy(lookAtPos);
  }

  resetCamera() {
    this.cameraAnimating = true;
    this.camTargetPos.set(0, this.camY, this.camZ);
    this.camTargetLook.set(0, 0, 0);
  }

  // Decompose children positions based on explosion factor
  applyExplosion(model, factor) {
    model.traverse(child => {
      if (!child.isMesh) return;
      
      // Store original local position on first run
      if (!child.userData.origPos) {
        child.userData.origPos = child.position.clone();
      }

      const name = child.name.toLowerCase();
      const orig = child.userData.origPos;
      const offset = new THREE.Vector3();

      if (name.includes('leg')) {
        // Legs explode outwards radially in X-Z
        const dir = new THREE.Vector3(orig.x, 0, orig.z).normalize();
        offset.copy(dir).multiplyScalar(0.7).setY(-0.3);
      } else if (name.includes('cushion') || name.includes('stooltop') || name.includes('benchtop') || name.includes('tabletop')) {
        // Cushion/Tops explode straight UP
        offset.set(0, 0.7, 0);
      } else if (name.includes('backslat')) {
        // Slats float back and out
        const numIdx = parseInt(name.split('_')[1]) || 0;
        offset.set(numIdx * 0.25, 0.1, -0.6);
      } else if (name.includes('toprail')) {
        // Top rail goes up and back
        offset.set(0, 0.5, -0.5);
      } else if (name.includes('armrest')) {
        // Armrests go outwards on X
        const dirX = orig.x > 0 ? 1 : -1;
        offset.set(dirX * 0.4, 0.1, 0);
      } else if (name.includes('armsupport')) {
        // Supports push outwards
        const dirX = orig.x > 0 ? 1 : -1;
        offset.set(dirX * 0.45, -0.15, 0.2);
      } else if (name.includes('shelf')) {
        // Shelves space out on Y
        const numIdx = parseInt(name.split('_')[1]) || 0;
        offset.set(0, (numIdx - 1.5) * 0.4, 0);
      } else if (name.includes('upright')) {
        // Upright posts separate on X
        const dirX = orig.x > 0 ? 1 : -1;
        offset.set(dirX * 0.4, 0, 0);
      } else if (name.includes('pin')) {
        // Shelf locking pins float out forward/back
        const dirX = orig.x > 0 ? 1 : -1;
        offset.set(dirX * 0.6, 0, 0.8);
      } else if (name.includes('stretcher')) {
        // Stretcher drops down
        offset.set(0, -0.5, 0);
      } else if (name.includes('frame')) {
        // Seat frames drop down slightly
        offset.set(0, -0.3, 0);
      }

      // Smoothly lerp towards target offset position
      child.position.copy(orig).addScaledVector(offset, factor);
    });
  }

  animate() {
    this.animationId = requestAnimationFrame(this.animate);

    // 1. Scale entry pop
    if (this.currentModel && this.popScale < 1.0) {
      this.popScale += (1.0 - this.popScale) * 0.14;
      if (this.popScale > 0.995) this.popScale = 1.0;
      this.currentModel.scale.setScalar(this.popScale);
    }

    // 2. Explode interpolation
    if (Math.abs(this.explodeAmount - this.targetExplodeAmount) > 0.001) {
      this.explodeAmount += (this.targetExplodeAmount - this.explodeAmount) * 0.08;
      if (this.currentModel) {
        this.applyExplosion(this.currentModel, this.explodeAmount);
      }
      // Dim contact shadow when model is exploded/floating
      this.shadowMesh.material.opacity = 0.24 * (1.0 - this.explodeAmount * 0.7);
    }

    // 3. Zoom level interpolation
    this.zoomScale += (this.targetZoomScale - this.zoomScale) * 0.08;
    this.holder.scale.setScalar(this.zoomScale);

    // 4. Handle inertia drag or idle rotation
    if (!this.dragging && this.autoRotate) {
      this.targetRotY += this.autoRotateSpeed;
    }

    this.currentRotY += (this.targetRotY - this.currentRotY) * 0.08;
    this.currentRotX += (this.targetRotX - this.currentRotX) * 0.08;

    if (this.currentModel) {
      this.currentModel.rotation.y = this.currentRotY;
      this.currentModel.rotation.x = -this.currentRotX; // invert drag up/down
    }

    // 5. Interpolate camera flight path
    if (this.cameraAnimating) {
      this.camera.position.lerp(this.camTargetPos, 0.06);
      this.camCurrentLook.lerp(this.camTargetLook, 0.06);
      this.camera.lookAt(this.camCurrentLook);

      // Finish condition
      if (this.camera.position.distanceTo(this.camTargetPos) < 0.01 && 
          this.camCurrentLook.distanceTo(this.camTargetLook) < 0.01) {
        this.cameraAnimating = false;
      }
    } else {
      this.camera.lookAt(0, 0, 0);
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.resize);
    // Cleanup events (simplifying but keeping safe)
    this.canvas.replaceWith(this.canvas.cloneNode(true));
  }
}
