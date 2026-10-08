// NOKKA Furniture — Central Product Database and 3D Mesh Builders

export let PRODUCTS = [];

// Async initializer to load products from database
export async function initProducts() {
  try {
    const res = await fetch('/api/products');
    if (res.ok) {
      const data = await res.json();
      
      const parsed = data.map(item => {
        if (item.specs_joint && !item.specs) {
          item.specs = {
            joint: item.specs_joint,
            finish: item.specs_finish,
            fabric: item.specs_fabric
          };
        }
        return item;
      });

      PRODUCTS.length = 0;
      PRODUCTS.push(...parsed);
      console.log('Synchronized products database successfully.');
    }
  } catch (e) {
    console.warn('Backend API offline. Using hardcoded catalog fallbacks.', e.message);
  }
  return PRODUCTS;
}

// Generate materials based on wood types and fabric colors
export function makeMaterials(THREE, options = {}) {
  const woodColors = {
    teak: 0xb06c37,
    sheesham: 0x8c4627,
    oak: 0xd4be98,
    walnut: 0x563821,
    rubber: 0xead2ab,
    metal: 0x9aa0a6,
    
    // fallbacks
    ash: 0xc4b39a,
    dark: 0x3d2717
  };

  const fabricColors = {
    beige: 0xe8dec9,
    cream: 0xf5f2eb,
    ivory: 0xfffefb,
    grey: 0xa8a7a5,
    charcoal: 0x3a3b3c,
    brown: 0x5c4033,
    tan: 0xb68a5d,
    black: 0x1a1a1a,
    navy: 0x101a35,
    green: 0x1a331e,
    maroon: 0x500d0e,
    
    // old fallback keys
    sage: 0x5e684a,
    rust: 0x964c3a
  };

  const finishTints = {
    natural: 0xffffff,
    walnut: 0xa08060,
    dark_oak: 0x605040,
    honey_oak: 0xffcc88,
    matte_black: 0x222222,
    classic_brown: 0x8a6040
  };

  const baseWoodColor = woodColors[options.wood] || woodColors.walnut;
  const finishTint = finishTints[options.finish] || finishTints.natural;

  // Perform a color blend in Three.js logic if color objects are available
  let finalWoodColor = baseWoodColor;
  try {
    const c1 = new THREE.Color(baseWoodColor);
    const c2 = new THREE.Color(finishTint);
    finalWoodColor = c1.multiply(c2).getHex();
  } catch(e){}

  const selectedFabricColor = fabricColors[options.fabric] || fabricColors.cream;
  const upholsteryType = options.upholstery || 'leather';

  let roughness = 0.85;
  let metalness = 0.0;
  let clearcoat = 0.0;
  let clearcoatRoughness = 0.0;

  if (upholsteryType === 'leather' || upholsteryType === 'premium-leather' || upholsteryType === 'genuine-leather' || upholsteryType === 'top-grain-leather' || upholsteryType === 'vegan-leather') {
    roughness = 0.35;
    metalness = 0.1;
    clearcoat = 0.4;
    clearcoatRoughness = 0.2;
  } else if (upholsteryType === 'velvet') {
    roughness = 0.85;
    metalness = 0.15; // mock soft velvet sheen
  } else if (upholsteryType === 'linen') {
    roughness = 0.95;
    metalness = 0.0;
  } else if (upholsteryType === 'chenille') {
    roughness = 0.9;
    metalness = 0.0;
  } else if (upholsteryType === 'boucle') {
    roughness = 0.78;
    metalness = 0.0;
  } else if (upholsteryType === 'cotton') {
    roughness = 0.85;
    metalness = 0.0;
  } else if (upholsteryType === 'suede') {
    roughness = 0.7;
    metalness = 0.0;
  }

  // Create standard wood material or metal
  const isMetal = options.wood === 'metal';
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: finalWoodColor,
    roughness: isMetal ? 0.25 : 0.52,
    metalness: isMetal ? 0.88 : 0.05,
    name: 'wood'
  });

  // Upholstery material (Physical for premium clearcoat highlight profiles)
  let fabricMaterial;
  try {
    fabricMaterial = new THREE.MeshPhysicalMaterial({
      color: selectedFabricColor,
      roughness: roughness,
      metalness: metalness,
      clearcoat: clearcoat,
      clearcoatRoughness: clearcoatRoughness,
      name: 'fabric'
    });
  } catch (err) {
    fabricMaterial = new THREE.MeshStandardMaterial({
      color: selectedFabricColor,
      roughness: roughness,
      metalness: metalness,
      name: 'fabric'
    });
  }

  return {
    wood: woodMaterial,
    woodDark: new THREE.MeshStandardMaterial({
      color: woodColors.dark,
      roughness: 0.6,
      metalness: 0.04,
      name: 'woodDark'
    }),
    fabric: fabricMaterial,
    brass: new THREE.MeshStandardMaterial({
      color: 0xc19d67,
      roughness: 0.28,
      metalness: 0.92,
      name: 'brass'
    }),
    stone: new THREE.MeshStandardMaterial({
      color: 0xdcd6c8,
      roughness: 0.8,
      metalness: 0.05,
      name: 'stone'
    })
  };
}

// Procedural Mesh Builders
export function buildChair(THREE, m, id = '') {
  const g = new THREE.Group();
  g.name = 'chair_root';

  id = id.toLowerCase();

  let isOffice = id.includes('office') || id.includes('executive') || id.includes('gaming') || id.includes('ergonomic');
  let isBarStool = id.includes('bar_stool') || id.includes('counter_stool') || id.includes('stool') && !id.includes('sofa');
  let isRocking = id.includes('rocking');
  let isFolding = id.includes('folding');
  let isCane = id.includes('cane');
  let isBeanBag = id.includes('bean_bag') || id.includes('beanbag');
  let isLounge = id.includes('lounge') || id.includes('recliner_chair') || id.includes('luxury_recliner');

  if (isBeanBag) {
    // Draw a big soft beanbag blob
    const beanGeo = new THREE.CylinderGeometry(0.9, 1.2, 1.5, 16, 8);
    const bean = new THREE.Mesh(beanGeo, m.fabric);
    bean.name = 'cushion';
    bean.position.y = -0.5;
    g.add(bean);

    // Indent on top
    const indent = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.4, 16), m.fabric);
    indent.position.y = 0.28;
    indent.name = 'cushion_top';
    g.add(indent);

    g.position.y = 0.2;
    return g;
  }

  // Seat Cushion
  let seatW = 2.2;
  let seatD = 2.0;
  let seatH = 0.22;
  let seatY = 0;

  if (isBarStool) {
    seatW = 1.6;
    seatD = 1.6;
    seatH = 0.18;
    seatY = 0.8; // higher seat
  } else if (isLounge) {
    seatW = 2.4;
    seatD = 2.2;
    seatH = 0.3;
    seatY = -0.2; // lower seat
  }

  const seat = new THREE.Mesh(new THREE.BoxGeometry(seatW, seatH, seatD), m.fabric);
  seat.name = 'cushion';
  seat.position.y = seatY;
  g.add(seat);

  // Seat Frame
  const seatFrame = new THREE.Mesh(new THREE.BoxGeometry(seatW + 0.1, 0.14, seatD + 0.1), m.wood);
  seatFrame.name = 'seatFrame';
  seatFrame.position.y = seatY - 0.13;
  g.add(seatFrame);

  // Backrest / Slats
  let backHeight = 1.7;
  let backAngle = -0.12;
  let backZ = -seatD/2 + 0.05;

  if (isOffice) {
    backHeight = 2.2; // tall backrest
    backAngle = -0.06;
  } else if (isLounge) {
    backHeight = 2.0;
    backAngle = -0.24; // more tilted
  }

  if (isCane) {
    // Outer wooden frame for back
    const backFrame = new THREE.Mesh(new THREE.BoxGeometry(seatW, backHeight, 0.12), m.wood);
    backFrame.name = 'backFrame';
    backFrame.position.set(0, seatY + backHeight/2 + 0.1, backZ - 0.1);
    backFrame.rotation.x = backAngle;
    g.add(backFrame);

    // Inner thin cane panel mesh
    const canePanel = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.3, backHeight - 0.3, 0.04), m.woodDark);
    canePanel.name = 'backSlat_cane';
    canePanel.position.set(0, seatY + backHeight/2 + 0.1, backZ - 0.08);
    canePanel.rotation.x = backAngle;
    g.add(canePanel);
  } else if (isOffice) {
    // Solid high back cushion for office/gaming
    const backCushion = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.1, backHeight, 0.24), m.fabric);
    backCushion.name = 'backSlat_office';
    backCushion.position.set(0, seatY + backHeight/2 + 0.1, backZ - 0.1);
    backCushion.rotation.x = backAngle;
    g.add(backCushion);

    if (id.includes('gaming')) {
      // Add wing highlights
      const headrest = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 0.28), m.brass);
      headrest.name = 'backSlat_headrest';
      headrest.position.set(0, seatY + backHeight + 0.15, backZ - 0.12);
      headrest.rotation.x = backAngle;
      g.add(headrest);
    }
  } else {
    // Standard backrest slats
    for (let i = -1; i <= 1; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.24, backHeight, 0.14), m.wood);
      slat.name = `backSlat_${i}`;
      slat.position.set(i * 0.65, seatY + backHeight/2 + 0.15, backZ - 0.05);
      slat.rotation.x = backAngle;
      g.add(slat);
    }

    const topRail = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.1, 0.18, 0.16), m.woodDark);
    topRail.name = 'topRail';
    topRail.position.set(0, seatY + backHeight + 0.16, backZ - 0.18);
    topRail.rotation.x = backAngle;
    g.add(topRail);
  }

  // Armrests (skip on dining chairs, bar stools, and folding chairs)
  let hasArmrests = !id.includes('dining') && !id.includes('folding') && !id.includes('bar_stool') && !id.includes('counter_stool') && !id.includes('wooden_chair');
  if (hasArmrests) {
    [-seatW/2 - 0.02, seatW/2 + 0.02].forEach((x, idx) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, seatD - 0.3), m.wood);
      arm.name = `armrest_${idx}`;
      arm.position.set(x, seatY + 0.55, seatD/2 - (seatD - 0.3)/2 - 0.1);
      g.add(arm);

      const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 10), m.wood);
      sup.name = `armSupport_${idx}`;
      sup.position.set(x, seatY + 0.28, seatD/2 - 0.45);
      g.add(sup);
    });
  }

  // Legs / Base structure
  if (isOffice) {
    // Swivel star base
    const baseGroup = new THREE.Group();
    baseGroup.name = 'leg_swivel_base';

    const stemGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.2, 12);
    const stem = new THREE.Mesh(stemGeo, m.woodDark);
    stem.position.set(0, seatY - 0.7, 0);
    baseGroup.add(stem);

    // 5 radial base arms
    const armGeo = new THREE.BoxGeometry(0.8, 0.08, 0.12);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const arm = new THREE.Mesh(armGeo, m.wood);
      arm.position.set(Math.cos(ang) * 0.4, seatY - 1.25, Math.sin(ang) * 0.4);
      arm.rotation.y = -ang;
      baseGroup.add(arm);

      // Wheel / castor
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 8), m.brass);
      wheel.position.set(Math.cos(ang) * 0.76, seatY - 1.35, Math.sin(ang) * 0.76);
      wheel.rotation.z = Math.PI / 2;
      baseGroup.add(wheel);
    }
    g.add(baseGroup);
  } else if (isRocking) {
    // 4 standard legs + rocking runners
    const legGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.4, 12);
    const legPositions = [
      [-seatW/2 + 0.2, seatY - 0.8, seatD/2 - 0.2],
      [seatW/2 - 0.2, seatY - 0.8, seatD/2 - 0.2],
      [-seatW/2 + 0.2, seatY - 0.8, -seatD/2 + 0.2],
      [seatW/2 - 0.2, seatY - 0.8, -seatD/2 + 0.2]
    ];

    legPositions.forEach((pos, idx) => {
      const leg = new THREE.Mesh(legGeo, m.woodDark);
      leg.name = `leg_${idx}`;
      leg.position.set(...pos);
      g.add(leg);
    });

    // Rocking arcs
    [-seatW/2 + 0.2, seatW/2 - 0.2].forEach((x, idx) => {
      const runner = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, seatD + 0.8), m.wood);
      runner.name = `leg_runner_${idx}`;
      runner.position.set(x, seatY - 1.5, 0);
      runner.rotation.x = 0.05;
      g.add(runner);
    });
  } else if (isFolding) {
    // X-crossed legs
    const legGroup = new THREE.Group();
    legGroup.name = 'leg_folding';

    const legL1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.08), m.woodDark);
    legL1.position.set(-seatW/2 + 0.2, seatY - 0.7, 0);
    legL1.rotation.z = 0.05;
    legL1.rotation.x = 0.45;
    legGroup.add(legL1);

    const legL2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.08), m.woodDark);
    legL2.position.set(-seatW/2 + 0.2, seatY - 0.7, 0);
    legL2.rotation.z = 0.05;
    legL2.rotation.x = -0.45;
    legGroup.add(legL2);

    const legR1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.08), m.woodDark);
    legR1.position.set(seatW/2 - 0.2, seatY - 0.7, 0);
    legR1.rotation.z = -0.05;
    legR1.rotation.x = 0.45;
    legGroup.add(legR1);

    const legR2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.08), m.woodDark);
    legR2.position.set(seatW/2 - 0.2, seatY - 0.7, 0);
    legR2.rotation.z = -0.05;
    legR2.rotation.x = -0.45;
    legGroup.add(legR2);

    g.add(legGroup);
  } else {
    // Standard 4 legs
    let legHeight = 1.5;
    let legY = seatY - 0.85;

    if (isBarStool) {
      legHeight = 2.3;
      legY = seatY - 1.25;
    } else if (isLounge) {
      legHeight = 1.0;
      legY = seatY - 0.65;
    }

    const legGeo = new THREE.CylinderGeometry(0.06, 0.08, legHeight, 12);
    const legPositions = [
      [-seatW/2 + 0.15, legY, seatD/2 - 0.15],
      [seatW/2 - 0.15, legY, seatD/2 - 0.15],
      [-seatW/2 + 0.15, legY, -seatD/2 + 0.15],
      [seatW/2 - 0.15, legY, -seatD/2 + 0.15]
    ];

    legPositions.forEach((pos, idx) => {
      const leg = new THREE.Mesh(legGeo, m.woodDark);
      leg.name = `leg_${idx}`;
      leg.position.set(...pos);
      leg.rotation.z = pos[0] > 0 ? -0.06 : 0.06;
      leg.rotation.x = pos[2] > 0 ? 0.06 : -0.06;
      g.add(leg);
    });

    if (isBarStool) {
      // Circular ring stretcher for stool footrest
      const ring = new THREE.Mesh(new THREE.TorusGeometry(seatW/2 - 0.1, 0.04, 8, 24), m.brass);
      ring.name = 'leg_footrest_ring';
      ring.rotation.x = Math.PI / 2;
      ring.position.y = legY - 0.2;
      g.add(ring);
    }
  }

  g.position.y = isBarStool ? -0.55 : (isLounge ? -0.2 : -0.3);
  return g;
}

export function buildSofa(THREE, m, id = '') {
  const g = new THREE.Group();
  g.name = 'sofa_root';

  id = id.toLowerCase();

  // Width variables
  let width = 3.2;
  let depth = 1.3;
  let isLShape = false;
  let isUShape = false;
  let isModular = false;
  let isChesterfield = false;
  let isBed = false;
  let isRecliner = false;

  if (id.includes('1_seater') || id.includes('one_seater')) {
    width = 1.5;
  } else if (id.includes('2_seater') || id.includes('two_seater') || id.includes('loveseat')) {
    width = 2.2;
  } else if (id.includes('3_seater') || id.includes('three_seater') || id.includes('luxury_sofa') || id.includes('royal_leather') || id.includes('garden_sofa')) {
    width = 3.2;
  } else if (id.includes('4_seater') || id.includes('four_seater')) {
    width = 4.2;
  }

  if (id.includes('l_shape') || id.includes('sectional') || id.includes('corner_sofa')) {
    width = 3.2;
    isLShape = true;
  }
  if (id.includes('u_shape')) {
    width = 3.4;
    isUShape = true;
  }
  if (id.includes('modular') || id.includes('cloud')) {
    width = 3.2;
    isModular = true;
  }
  if (id.includes('chesterfield')) {
    width = 3.2;
    isChesterfield = true;
  }
  if (id.includes('cum_bed') || id.includes('bed')) {
    width = 3.0;
    isBed = true;
  }
  if (id.includes('recliner')) {
    width = 2.8;
    isRecliner = true;
  }

  // Base Cushion
  if (isBed) {
    // A double layer to show pull-out bed functionality
    const baseGroup = new THREE.Group();
    baseGroup.name = 'cushion_group';
    const topMat = new THREE.Mesh(new THREE.BoxGeometry(width, 0.35, depth), m.fabric);
    topMat.position.y = 0.15;
    topMat.name = 'cushion';
    const pullOut = new THREE.Mesh(new THREE.BoxGeometry(width - 0.2, 0.3, depth - 0.1), m.fabric);
    pullOut.position.set(0, -0.15, 0.4);
    pullOut.name = 'cushion_bed';
    baseGroup.add(topMat);
    baseGroup.add(pullOut);
    g.add(baseGroup);
  } else if (isLShape) {
    const baseGroup = new THREE.Group();
    baseGroup.name = 'cushion_group';
    const mainBase = new THREE.Mesh(new THREE.BoxGeometry(width, 0.52, depth), m.fabric);
    mainBase.position.y = 0.05;
    mainBase.name = 'cushion';
    baseGroup.add(mainBase);

    // L extension on left
    const ext = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.52, 1.4), m.fabric);
    ext.position.set(-1.1, 0.05, 0.85); // forward extension
    ext.name = 'cushion_l_extension';
    baseGroup.add(ext);
    g.add(baseGroup);
  } else if (isUShape) {
    const baseGroup = new THREE.Group();
    baseGroup.name = 'cushion_group';
    const mainBase = new THREE.Mesh(new THREE.BoxGeometry(width, 0.52, depth), m.fabric);
    mainBase.position.y = 0.05;
    mainBase.name = 'cushion';
    baseGroup.add(mainBase);

    // Left extension
    const extL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.52, 1.4), m.fabric);
    extL.position.set(-(width/2 - 0.45), 0.05, 0.85);
    extL.name = 'cushion_u_left';
    baseGroup.add(extL);

    // Right extension
    const extR = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.52, 1.4), m.fabric);
    extR.position.set((width/2 - 0.45), 0.05, 0.85);
    extR.name = 'cushion_u_right';
    baseGroup.add(extR);
    g.add(baseGroup);
  } else if (isModular) {
    // 3 separate block cushions
    const numBlocks = 3;
    const blockW = width / numBlocks;
    for (let i = 0; i < numBlocks; i++) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(blockW - 0.06, 0.58, depth), m.fabric);
      block.name = i === 0 ? 'cushion' : `cushion_block_${i}`;
      block.position.set((i - 1) * blockW, 0.05, 0);
      g.add(block);
    }
  } else {
    // Standard base
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, 0.52, depth), m.fabric);
    base.name = 'cushion';
    base.position.y = 0.05;
    g.add(base);
  }

  // Backrest
  if (!isModular) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(width, 0.9, 0.3), m.fabric);
    back.name = 'backrest';
    back.position.set(0, 0.72, -depth/2 + 0.15);
    g.add(back);

    if (isLShape) {
      // Backrest extending along the L
      const backL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 1.2), m.fabric);
      backL.position.set(-1.45, 0.72, 0.4);
      backL.name = 'backrest_l';
      g.add(backL);
    }
    if (isUShape) {
      const backL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 1.2), m.fabric);
      backL.position.set(-(width/2 - 0.15), 0.72, 0.4);
      backL.name = 'backrest_u_l';
      g.add(backL);

      const backR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 1.2), m.fabric);
      backR.position.set((width/2 - 0.15), 0.72, 0.4);
      backR.name = 'backrest_u_r';
      g.add(backR);
    }
  } else {
    // Modular separate backrests
    const numBlocks = 3;
    const blockW = width / numBlocks;
    for (let i = 0; i < numBlocks; i++) {
      const blockBack = new THREE.Mesh(new THREE.BoxGeometry(blockW - 0.06, 0.8, 0.3), m.fabric);
      blockBack.name = `backrest_block_${i}`;
      blockBack.position.set((i - 1) * blockW, 0.65, -depth/2 + 0.15);
      g.add(blockBack);
    }
  }

  // Armrests (except U-shape)
  if (!isUShape) {
    if (isChesterfield) {
      // Chesterfield rolled arms - cylinders
      [-width/2, width/2].forEach((x, idx) => {
        const armGeo = new THREE.CylinderGeometry(0.2, 0.2, depth + 0.1, 16);
        const arm = new THREE.Mesh(armGeo, m.fabric);
        arm.name = `armrest_${idx}`;
        arm.rotation.x = Math.PI / 2;
        arm.position.set(x, 0.58, 0);
        g.add(arm);
      });
    } else if (isModular) {
      // Modular low profiles usually don't have hard armrests
    } else {
      // Standard armrests
      [-width/2 - 0.05, width/2 + 0.05].forEach((x, idx) => {
        if (isLShape && idx === 0) return; // skip left arm for L sectional hookup
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, depth), m.fabric);
        arm.name = `armrest_${idx}`;
        arm.position.set(x, 0.4, 0);
        g.add(arm);
      });
    }
  }

  // Frame
  const frameWidth = width + (isChesterfield ? 0.3 : 0.1);
  const frameDepth = depth + (isLShape || isUShape ? 1.0 : 0.06);
  const frameZ = isLShape || isUShape ? 0.5 : 0;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(frameWidth, 0.12, frameDepth), m.wood);
  frame.name = 'sofaFrame';
  frame.position.set(0, -0.24, frameZ);
  g.add(frame);

  // Recliner footrest
  if (isRecliner) {
    const footrest = new THREE.Mesh(new THREE.BoxGeometry(width - 0.4, 0.18, 0.5), m.fabric);
    footrest.position.set(0, -0.15, depth/2 + 0.1);
    footrest.name = 'cushion_footrest';
    g.add(footrest);

    const metalPart = new THREE.Mesh(new THREE.BoxGeometry(width - 0.6, 0.04, 0.3), m.brass);
    metalPart.position.set(0, -0.22, depth/2 - 0.05);
    metalPart.name = 'leg_metal_recliner';
    g.add(metalPart);
  }

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.4, 10);
  const legPositions = [
    [-frameWidth/2 + 0.1, -0.5, frameZ + frameDepth/2 - 0.1],
    [frameWidth/2 - 0.1, -0.5, frameZ + frameDepth/2 - 0.1],
    [-frameWidth/2 + 0.1, -0.5, frameZ - frameDepth/2 + 0.1],
    [frameWidth/2 - 0.1, -0.5, frameZ - frameDepth/2 + 0.1]
  ];

  if (isLShape || isUShape) {
    legPositions.push([0, -0.5, frameZ + frameDepth/2 - 0.1]);
    legPositions.push([0, -0.5, frameZ - frameDepth/2 + 0.1]);
  }

  legPositions.forEach((pos, idx) => {
    const leg = new THREE.Mesh(legGeo, m.woodDark);
    leg.name = `leg_${idx}`;
    leg.position.set(...pos);
    g.add(leg);
  });

  g.position.y = -0.15;
  return g;
}

export function buildTable(THREE, m) {
  const g = new THREE.Group();
  g.name = 'table_root';

  const top = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 1.35), m.wood);
  top.name = 'tabletop';
  top.position.y = 0.55;
  g.add(top);

  const legGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.15, 12);
  const legPositions = [
    [-1.2, -0.05, 0.55],
    [1.2, -0.05, 0.55],
    [-1.2, -0.05, -0.55],
    [1.2, -0.05, -0.55]
  ];

  legPositions.forEach((pos, idx) => {
    const leg = new THREE.Mesh(legGeo, m.woodDark);
    leg.name = `leg_${idx}`;
    leg.position.set(...pos);
    leg.rotation.z = pos[0] > 0 ? -0.08 : 0.08;
    leg.rotation.x = pos[2] > 0 ? 0.08 : -0.08;
    g.add(leg);
  });

  const stretcher = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.06), m.woodDark);
  stretcher.name = 'stretcher';
  stretcher.position.set(0, -0.35, 0);
  g.add(stretcher);

  g.position.y = -0.25;
  return g;
}

export function buildBench(THREE, m) {
  const g = new THREE.Group();
  g.name = 'bench_root';

  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 0.78), m.wood);
  seat.name = 'benchtop';
  seat.position.y = 0.35;
  g.add(seat);

  [-1.2, 1.2].forEach((x, idx) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.85, 0.62), m.woodDark);
    leg.name = `leg_${idx}`;
    leg.position.set(x, -0.15, 0);
    g.add(leg);
  });

  g.position.y = -0.1;
  return g;
}

export function buildShelf(THREE, m) {
  const g = new THREE.Group();
  g.name = 'shelf_root';

  [-1.0, 1.0].forEach((x, idx) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.4), m.wood);
    post.name = `upright_${idx}`;
    post.position.set(x, 0, 0);
    g.add(post);
  });

  const shelfLevels = [-1.0, -0.35, 0.35, 1.0];
  shelfLevels.forEach((y, idx) => {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.07, 0.42), m.woodDark);
    shelf.name = `shelf_${idx}`;
    shelf.position.set(0, y * 1.15, 0);
    g.add(shelf);

    const pinGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.42, 8);
    const pin = new THREE.Mesh(pinGeo, m.brass);
    pin.name = `pinL_${idx}`;
    pin.rotation.x = Math.PI / 2;
    pin.position.set(-1.0, y * 1.15, 0);
    g.add(pin);

    const pin2 = new THREE.Mesh(pinGeo, m.brass);
    pin2.name = `pinR_${idx}`;
    pin2.rotation.x = Math.PI / 2;
    pin2.position.set(1.0, y * 1.15, 0);
    g.add(pin2);
  });

  g.position.y = -0.15;
  return g;
}

export function buildStool(THREE, m) {
  const g = new THREE.Group();
  g.name = 'stool_root';

  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.58, 0.22, 24), m.wood);
  seat.name = 'stooltop';
  seat.position.y = 1.0;
  g.add(seat);

  const legGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.35, 10);
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    const x = Math.cos(ang) * 0.55,
      z = Math.sin(ang) * 0.55;
    const leg = new THREE.Mesh(legGeo, m.woodDark);
    leg.name = `leg_${i}`;
    leg.position.set(x, 0.3, z);
    leg.lookAt(new THREE.Vector3(0, -0.9, 0));
    leg.rotateX(Math.PI / 2);
    g.add(leg);
  }

  const stretcherGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.85, 8);
  for (let i = 0; i < 3; i++) {
    const ang = ((i / 3) * Math.PI * 2) + Math.PI / 3;
    const x = Math.cos(ang) * 0.32,
      z = Math.sin(ang) * 0.32;
    const s = new THREE.Mesh(stretcherGeo, m.woodDark);
    s.name = `stretcher_${i}`;
    s.position.set(x, 0.05, z);
    s.rotation.y = ang;
    s.rotation.z = Math.PI / 2.1;
    g.add(s);
  }

  g.position.y = -0.5;
  return g;
}

// 7. Platform Bed Builder
export function buildBed(THREE, m) {
  const g = new THREE.Group();
  g.name = 'bed_root';

  // Bed Base Frame
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.25, 2.5), m.wood);
  base.name = 'bedBase';
  base.position.set(0, -0.4, 0);
  g.add(base);

  // Mattress
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 2.3), m.fabric);
  mattress.name = 'mattress';
  mattress.position.set(0, -0.05, 0.08);
  g.add(mattress);

  // Headboard
  const headboard = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 0.16), m.woodDark);
  headboard.name = 'headboard';
  headboard.position.set(0, 0.4, -1.15);
  g.add(headboard);

  // Pillows
  [-0.5, 0.5].forEach((x, i) => {
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.45), m.fabric);
    pillow.name = `pillow_${i}`;
    pillow.position.set(x, 0.22, -0.75);
    pillow.rotation.x = 0.08;
    g.add(pillow);
  });

  g.position.y = -0.2;
  return g;
}

// 8. Executive Desk Builder
export function buildDesk(THREE, m) {
  const g = new THREE.Group();
  g.name = 'desk_root';

  // Desktop
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 1.4), m.wood);
  top.name = 'desktop';
  top.position.y = 0.55;
  g.add(top);

  // Left drawers cabinet block
  const cabinetL = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 1.2), m.woodDark);
  cabinetL.name = 'cabinetL';
  cabinetL.position.set(-0.95, 0.06, 0);
  g.add(cabinetL);

  // Right drawers cabinet block
  const cabinetR = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 1.2), m.woodDark);
  cabinetR.name = 'cabinetR';
  cabinetR.position.set(0.95, 0.06, 0);
  g.add(cabinetR);

  // Drawer brass handles
  [-0.95, 0.95].forEach((x, i) => {
    [0.3, 0.05, -0.2].forEach((y, k) => {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.04), m.brass);
      handle.name = `handle_${i}_${k}`;
      handle.position.set(x, y, 0.61);
      g.add(handle);
    });
  });

  // Stretcher back panel
  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.6, 0.06), m.wood);
  backPanel.name = 'backPanel';
  backPanel.position.set(0, 0.2, -0.45);
  g.add(backPanel);

  g.position.y = -0.15;
  return g;
}

// 9. Minimalist Lamp Builder
export function buildLamp(THREE, m) {
  const g = new THREE.Group();
  g.name = 'lamp_root';

  // Base stand
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.08, 16), m.woodDark);
  base.name = 'lampBase';
  base.position.y = -1.45;
  g.add(base);

  // Metal stem post
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 2.5, 8), m.brass);
  stem.name = 'lampStem';
  stem.position.y = -0.2;
  g.add(stem);

  // Lampshade
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.52, 16), m.fabric);
  shade.name = 'lampshade';
  shade.position.y = 1.0;
  g.add(shade);

  g.position.y = 0.3;
  return g;
}

export const BUILDERS = {
  chair: buildChair,
  sofa: buildSofa,
  table: buildTable,
  bench: buildBench,
  shelf: buildShelf,
  stool: buildStool,
  bed: buildBed,
  desk: buildDesk,
  lamp: buildLamp
};
