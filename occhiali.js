// occhiali.js – la pagina Occhiali 3D Franci (occhiali.html)
//
// Il modello si carica una volta sola e poi si "clona" per ogni visore:
//   - eroe:   l'animazione d'apertura in cima alla pagina
//   - foto:   un renderer nascosto che scatta le 5 foto
//   - gira:   gli occhiali da girare col mouse, che si aprono e chiudono
//   - colori: l'anteprima sopra il row dei colori
// Tutti i cloni usano GLI STESSI materiali: cambiando un colore cambia ovunque.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FILE_MODELLO = 'models/3d_occhiali_giuli.glb';
const GRANDEZZA = 2;   // la misura più grande del modello nella scena

// quanto ruotano le stanghette per chiudersi: un po' diverse, così quando
// sono chiuse non si incastrano una dentro l'altra (come negli occhiali veri)
const CHIUSURA_SINISTRA = THREE.MathUtils.degToRad(-91);
const CHIUSURA_DESTRA = THREE.MathUtils.degToRad(77);


// ===== i colori =====

// per ogni parte: i campioni e quello di partenza
const PARTI = [
    {
        id: 'frontale', nome: 'Frontale', iniziale: 1,
        campioni: [
            ['Cristallo', '#f4f4f2'], ['Fumo', '#4a5058'], ['Ambra', '#c98a3d'],
            ['Rosa cipria', '#e3aeb1'], ['Verde bottiglia', '#2f5d50'], ['Blu cobalto', '#2b4c9e']
        ],
        finiture: ['Trasparente', 'Lucido', 'Opaco']
    },
    {
        id: 'stanghette', nome: 'Stanghette', iniziale: 0,
        campioni: [
            ['Nero', '#1c1c1c'], ['Tabacco', '#6b3f22'], ['Panna', '#efe6d2'],
            ['Rosso bordò', '#7a1f2b'], ['Salvia', '#8a9a7b'], ['Blu notte', '#1b2a41']
        ]
    },
    {
        id: 'cerniere', nome: 'Cerniere', iniziale: 0,
        campioni: [
            ['Argento', '#d0d3d8'], ['Oro', '#d4ae58'], ['Oro rosa', '#d29a86'],
            ['Canna di fucile', '#4a4d52'], ['Nero opaco', '#202020']
        ]
    }
];

// le combinazioni: un colore per parte (frontale, stanghette, cerniere) + la finitura del frontale
const COMBINAZIONI = [
    { nome: 'Classico', colori: ['#4a5058', '#1c1c1c', '#d0d3d8'], finitura: 'Trasparente' },
    { nome: 'Miele',    colori: ['#c98a3d', '#6b3f22', '#d4ae58'], finitura: 'Trasparente' },
    { nome: 'Riviera',  colori: ['#f4f4f2', '#1b2a41', '#d29a86'], finitura: 'Trasparente' },
    { nome: 'Bosco',    colori: ['#2f5d50', '#8a9a7b', '#4a4d52'], finitura: 'Lucido' },
    { nome: 'Gesso',    colori: ['#efe6d2', '#efe6d2', '#202020'], finitura: 'Opaco' }
];

// i tre materiali condivisi
const materiali = {
    frontale: new THREE.MeshPhysicalMaterial({
        color: PARTI[0].campioni[PARTI[0].iniziale][1],
        metalness: 0,
        roughness: 0.06,
        transmission: 0.92,   // come vetro colorato
        thickness: 0.2,
        ior: 1.5,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        side: THREE.DoubleSide
    }),
    stanghette: new THREE.MeshPhysicalMaterial({
        color: PARTI[1].campioni[PARTI[1].iniziale][1],
        metalness: 0,
        roughness: 0.3,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        side: THREE.DoubleSide
    }),
    cerniere: new THREE.MeshStandardMaterial({
        color: PARTI[2].campioni[PARTI[2].iniziale][1],
        metalness: 1,
        roughness: 0.25,
        side: THREE.DoubleSide
    })
};

function impostaFinitura(nome) {
    const m = materiali.frontale;
    if (nome === 'Trasparente') { m.transmission = 0.92; m.roughness = 0.06; m.clearcoat = 1; }
    if (nome === 'Lucido')      { m.transmission = 0;    m.roughness = 0.18; m.clearcoat = 1; }
    if (nome === 'Opaco')       { m.transmission = 0;    m.roughness = 0.75; m.clearcoat = 0; }
    m.needsUpdate = true;
}


// ===== gli occhiali: un clone del modello con le stanghette che si aprono =====

// Il file non dà un nome ai pezzi: ci sono solo due gruppi, "aste" e "lente".
// - "lente" è il frontale
// - in "aste" riconosco i pezzi dalla forma:
//     lunghi in profondità  -> stanghette
//     cubetti piccolissimi  -> cerniere attaccate al frontale (fanno da perno)
//     il resto              -> cerniere attaccate alle stanghette (girano con loro)
function creaOcchiali(sorgente) {
    const modello = sorgente.clone(true);
    modello.updateMatrixWorld(true);

    const aste = modello.getObjectByName('aste');
    const lente = modello.getObjectByName('lente');

    lente.traverse(function(o) { if (o.isMesh) o.material = materiali.frontale; });

    const lati = { '-1': { mobili: [], perno: null }, '1': { mobili: [], perno: null } };

    const esplosi = [{ o: lente, d: new THREE.Vector3(0, 0, 0.07) }];
    const parti = { frontale: lente };

    aste.children.slice().forEach(function(pezzo) {
        const scatola = new THREE.Box3().setFromObject(pezzo);
        const misura = scatola.getSize(new THREE.Vector3());
        const centro = scatola.getCenter(new THREE.Vector3());
        const lato = lati[centro.x < 0 ? '-1' : '1'];
        const segno = centro.x < 0 ? -1 : 1;

        // per l'esploso: in che direzione (e quanto, in metri) si allontana ogni pezzo
        let materiale;
        if (misura.z > 0.1) {
            materiale = materiali.stanghette;
            lato.mobili.push(pezzo);
            esplosi.push({ o: pezzo, d: new THREE.Vector3(segno * 0.07, 0, -0.035) });
            parti.stanghette = pezzo;
        } else if (Math.max(misura.x, misura.y, misura.z) < 0.007) {
            materiale = materiali.cerniere;
            lato.perno = centro;   // la cerniera: qui gira la stanghetta
            esplosi.push({ o: pezzo, d: new THREE.Vector3(segno * 0.03, 0, 0.012) });
            parti.cerniere = pezzo;
        } else {
            materiale = materiali.cerniere;
            lato.mobili.push(pezzo);
            esplosi.push({ o: pezzo, d: new THREE.Vector3(segno * 0.045, 0, -0.012) });
        }
        pezzo.traverse(function(o) { if (o.isMesh) o.material = materiale; });
    });

    // per ogni lato: un perno invisibile sulla cerniera, con attaccati i pezzi che si muovono
    const cerniere = [];
    ['-1', '1'].forEach(function(chiave) {
        const lato = lati[chiave];
        if (!lato.perno || lato.mobili.length === 0) return;
        const perno = new THREE.Object3D();
        perno.position.copy(lato.perno);
        aste.add(perno);
        aste.updateMatrixWorld(true);
        lato.mobili.forEach(function(p) { perno.attach(p); });
        cerniere.push({ perno: perno, chiuso: chiave === '-1' ? CHIUSURA_SINISTRA : CHIUSURA_DESTRA });
    });

    // centro il modello e lo porto alla grandezza giusta (misurato da aperto)
    const scatola = new THREE.Box3().setFromObject(modello);
    const misura = scatola.getSize(new THREE.Vector3());
    const centro = scatola.getCenter(new THREE.Vector3());
    const fattore = GRANDEZZA / Math.max(misura.x, misura.y, misura.z);
    modello.scale.setScalar(fattore);
    modello.position.copy(centro).multiplyScalar(-fattore);

    const gruppo = new THREE.Group();
    gruppo.add(modello);
    esplosi.forEach(function(e) { e.base = e.o.position.clone(); });

    return {
        gruppo: gruppo,
        // 1 = aperti, 0 = chiusi
        apri: function(quanto) {
            cerniere.forEach(function(c) { c.perno.rotation.y = (1 - quanto) * c.chiuso; });
        },
        // 0 = montati, 1 = tutti i pezzi separati
        esplodi: function(quanto) {
            esplosi.forEach(function(e) { e.o.position.copy(e.base).addScaledVector(e.d, quanto); });
        },
        parti: parti
    };
}


// ===== un visore: renderer, scena, camera e luci =====

function creaScena(renderer, coloreSfondo) {
    const scena = new THREE.Scene();
    scena.background = new THREE.Color(coloreSfondo);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scena.environmentIntensity = 0.9;

    const luce = new THREE.DirectionalLight(0xffffff, 1.6);
    luce.position.set(2, 4, 3);
    scena.add(luce);
    const controluce = new THREE.DirectionalLight(0xffffff, 0.6);
    controluce.position.set(-3, 2, -4);
    scena.add(controluce);
    return scena;
}

// l'ombra morbida sotto gli occhiali: un cerchio sfumato disegnato su un canvas
let texturaOmbra = null;
function creaOmbra(chiaro) {
    if (!texturaOmbra) {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const g = c.getContext('2d');
        const sfumatura = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        sfumatura.addColorStop(0, 'rgba(0,0,0,0.55)');
        sfumatura.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sfumatura;
        g.fillRect(0, 0, 256, 256);
        texturaOmbra = new THREE.CanvasTexture(c);
    }
    const ombra = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 2.2),
        new THREE.MeshBasicMaterial({ map: texturaOmbra, transparent: true, depthWrite: false, opacity: chiaro ? 0.35 : 0.6 })
    );
    ombra.rotation.x = -Math.PI / 2;
    ombra.position.y = -0.47;
    return ombra;
}

function creaVisore(elemento, opzioni) {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    elemento.appendChild(renderer.domElement);

    const sfondo = getComputedStyle(elemento).backgroundColor;
    const scena = creaScena(renderer, sfondo);
    const camera = new THREE.PerspectiveCamera(opzioni.fov || 30, 1, 0.1, 100);

    const visore = { elemento, renderer, scena, camera, visibile: true, alRidimensiona: null };

    new ResizeObserver(function(voci) {
        const { width, height } = voci[0].contentRect;
        if (!width || !height) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        if (visore.alRidimensiona) visore.alRidimensiona();
    }).observe(elemento);

    // disegno solo quando il visore si vede: la pagina resta leggera
    new IntersectionObserver(function(voci) {
        visore.visibile = voci[0].isIntersecting;
    }).observe(elemento);

    return visore;
}

// porta la camera in modo che l'oggetto entri tutto nell'inquadratura, guardandolo da "direzione"
function inquadra(camera, oggetto, direzione, margine, alto) {
    const scatola = new THREE.Box3().setFromObject(oggetto);
    const centro = scatola.getCenter(new THREE.Vector3());
    const dir = direzione.clone().normalize();

    camera.up.copy(alto || new THREE.Vector3(0, 1, 0));
    camera.position.copy(centro).addScaledVector(dir, 10);
    camera.lookAt(centro);
    camera.updateMatrixWorld();

    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * camera.aspect;
    let distanza = 0;
    const p = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
        p.set(i & 1 ? scatola.max.x : scatola.min.x,
              i & 2 ? scatola.max.y : scatola.min.y,
              i & 4 ? scatola.max.z : scatola.min.z).applyMatrix4(camera.matrixWorldInverse);
        const avanti = 10 + p.z;   // quanto questo angolo sta più vicino alla camera rispetto al centro
        distanza = Math.max(distanza,
            avanti + Math.abs(p.x) * margine / tanH,
            avanti + Math.abs(p.y) * margine / tanV);
    }
    camera.position.copy(centro).addScaledVector(dir, distanza);
    camera.lookAt(centro);
}

const morbido = (t) => t * t * (3 - 2 * t);
const limita = (t) => Math.min(1, Math.max(0, t));


// ===== 1. l'animazione d'apertura =====

function avviaEroe(sorgente) {
    const el = document.querySelector('[data-visore="eroe"]');
    const v = creaVisore(el, { fov: 28 });
    const occhiali = creaOcchiali(sorgente);
    v.scena.add(occhiali.gruppo);
    v.scena.add(creaOmbra(true));

    // la camera sta un po' in alto; la distanza dipende dalla forma del visore
    v.alRidimensiona = function() {
        const tanV = Math.tan(THREE.MathUtils.degToRad(v.camera.fov / 2));
        const d = Math.max(1.25 / (tanV * v.camera.aspect), 1.05 / tanV) * 1.12;
        v.camera.position.set(0, 0.32, 1).normalize().multiplyScalar(d);
        // il titolo è al centro in alto: guardo un po' più su, così gli occhiali scendono sotto il titolo
        v.camera.lookAt(0, 0.4 * d * tanV, 0);
    };

    let inizio = performance.now();
    document.getElementById('rivedi').addEventListener('click', function() { inizio = performance.now(); });

    // la sequenza, in secondi:
    //   0 – 1.6   gli occhiali chiusi arrivano girando su sé stessi
    //   1.6 – 3   le stanghette si aprono
    //   dopo      ondeggiano piano, aperti
    const fermo = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    v.renderer.setAnimationLoop(function() {
        if (!v.visibile) return;
        const t = fermo ? 10 : (performance.now() - inizio) / 1000;

        const arrivo = morbido(limita(t / 1.6));
        const apertura = morbido(limita((t - 1.6) / 1.4));
        const ondeggio = limita((t - 2.6) / 1.5);

        occhiali.apri(apertura);
        occhiali.gruppo.rotation.y = (1 - arrivo) * -Math.PI * 1.5
            + 0.45 * (1 - apertura) + Math.sin((t - 2.6) * 0.55) * 0.42 * ondeggio;
        occhiali.gruppo.rotation.x = (1 - arrivo) * 0.5 + Math.sin(t * 0.8) * 0.04 * ondeggio;
        occhiali.gruppo.position.y = (1 - arrivo) * 1.4 + Math.sin(t * 1.1) * 0.04 * ondeggio;
        occhiali.gruppo.scale.setScalar(0.75 + 0.25 * arrivo);

        v.renderer.render(v.scena, v.camera);
    });
}


// ===== 2. le foto =====

function avviaFoto(sorgente) {
    const immagini = document.querySelectorAll('.foto img');
    const griglia = document.querySelector('.foto-griglia');

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scena = creaScena(renderer, '#f5f5f7');
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    const occhiali = creaOcchiali(sorgente);
    scena.add(occhiali.gruppo);
    const ombra = creaOmbra(true);
    scena.add(ombra);

    // da dove guardo per ogni foto (il frontale guarda verso +z, l'alto è +y)
    const VISTE = {
        treQuarti: { dir: new THREE.Vector3(1.1, 0.45, 1.25), aperti: 1, margine: 1.12 },
        chiusi:    { dir: new THREE.Vector3(-0.9, 0.7, 1.3),  aperti: 0, margine: 1.25 },
        fronte:    { dir: new THREE.Vector3(0, 0.02, 1),      aperti: 1, margine: 1.15 },
        profilo:   { dir: new THREE.Vector3(1, 0.02, 0),      aperti: 1, margine: 1.15 },
        alto:      { dir: new THREE.Vector3(0, 1, 0.0001),    aperti: 1, margine: 1.15, alto: new THREE.Vector3(0, 0, -1), senzaOmbra: true }
    };

    function scatta() {
        immagini.forEach(function(img) {
            const vista = VISTE[img.dataset.vista];
            const w = Number(img.dataset.w), h = Number(img.dataset.h);
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();

            occhiali.apri(vista.aperti);
            ombra.visible = !vista.senzaOmbra;
            inquadra(camera, occhiali.gruppo, vista.dir, vista.margine, vista.alto);
            renderer.render(scena, camera);
            img.src = renderer.domElement.toDataURL('image/jpeg', 0.92);
        });
        griglia.classList.remove('aggiorno');
    }

    // quando cambia un colore, rifaccio le foto poco dopo (non a ogni movimento del selettore)
    let timer = null;
    function programma() {
        griglia.classList.add('aggiorno');
        clearTimeout(timer);
        timer = setTimeout(scatta, 350);
    }

    scatta();
    return programma;
}


// ===== 3. gira gli occhiali: si aprono e si chiudono =====

function avviaGira(sorgente) {
    const el = document.querySelector('[data-visore="gira"]');
    const v = creaVisore(el, { fov: 32 });
    const occhiali = creaOcchiali(sorgente);
    v.scena.add(occhiali.gruppo);
    v.scena.add(creaOmbra(false));

    const controlli = new OrbitControls(v.camera, v.renderer.domElement);
    controlli.enableDamping = true;
    controlli.enablePan = false;
    controlli.enableZoom = false;   // la rotella resta per scorrere la pagina
    controlli.minPolarAngle = 0.35;
    controlli.maxPolarAngle = 1.75;
    controlli.rotateSpeed = 0.8;

    let distanza = 6;
    v.alRidimensiona = function() {
        // distanza perché gli occhiali (larghi ~2) entrino in qualsiasi direzione li giri
        const tanV = Math.tan(THREE.MathUtils.degToRad(v.camera.fov / 2));
        distanza = Math.max(1.3 / (tanV * v.camera.aspect), 1.1 / tanV) * 1.15;
        v.camera.position.setLength(distanza);
    };
    v.camera.position.set(0, 0.5, 2).setLength(distanza);

    // i bottoni Fronte / Tre quarti / Profilo / Retro: la camera ci gira intorno piano piano
    let angoloObiettivo = null;
    const scatti = el.closest('section').querySelectorAll('.pillola');
    scatti.forEach(function(b) {
        b.addEventListener('click', function() {
            angoloObiettivo = THREE.MathUtils.degToRad(Number(b.dataset.angolo));
        });
    });
    controlli.addEventListener('start', function() {
        angoloObiettivo = null;
        el.classList.add('toccato');
    });

    const testoRotazione = document.getElementById('dato-rotazione');
    const testoApertura = document.getElementById('dato-apertura');
    const barra = document.getElementById('barra-apertura');
    const sferica = new THREE.Spherical();
    let apertura = 1;
    let ultimoTesto = '';

    v.renderer.setAnimationLoop(function() {
        if (!v.visibile) return;

        if (angoloObiettivo !== null) {
            sferica.setFromVector3(v.camera.position);
            let diff = angoloObiettivo - sferica.theta;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));   // la strada più corta
            sferica.theta += diff * 0.08;
            v.camera.position.setFromSpherical(sferica);
            if (Math.abs(diff) < 0.002) angoloObiettivo = null;
        }
        controlli.update();

        // l'angolo intorno agli occhiali: 0 = di fronte, ±180° = da dietro
        const azimut = controlli.getAzimuthalAngle();
        // di fronte aperti (1), di profilo a metà, da dietro chiusi (0)
        const obiettivo = morbido((1 + Math.cos(azimut)) / 2);
        apertura += (obiettivo - apertura) * 0.15;
        occhiali.apri(apertura);

        // i numeri accanto al visore
        const gradi = Math.round(Math.abs(THREE.MathUtils.radToDeg(azimut)));
        const percento = Math.round(apertura * 100);
        const stato = percento > 92 ? 'Aperte' : percento < 8 ? 'Chiuse' : 'In movimento';
        const testo = gradi + '|' + percento;
        if (testo !== ultimoTesto) {
            ultimoTesto = testo;
            testoRotazione.textContent = gradi + '°';
            testoApertura.textContent = stato + ' · ' + percento + '%';
            barra.style.transform = 'scaleX(' + apertura.toFixed(3) + ')';
            // evidenzio il bottone della vista più vicina
            let vicino = null, minimo = Infinity;
            scatti.forEach(function(b) {
                const d = Math.abs(gradi - Number(b.dataset.angolo));
                if (d < minimo) { minimo = d; vicino = b; }
            });
            scatti.forEach(function(b) { b.classList.toggle('selected', b === vicino && minimo < 12); });
        }

        v.renderer.render(v.scena, v.camera);
    });
}


// ===== 4. il row dei colori =====

function avviaColori(sorgente, aggiornaFoto) {
    const el = document.querySelector('[data-visore="colori"]');
    const v = creaVisore(el, { fov: 28 });
    const occhiali = creaOcchiali(sorgente);
    v.scena.add(occhiali.gruppo);
    v.scena.add(creaOmbra(true));
    v.alRidimensiona = function() {
        occhiali.gruppo.rotation.y = 0;
        inquadra(v.camera, occhiali.gruppo, new THREE.Vector3(0, 0.35, 1), 1.6);
    };

    // l'anteprima gira piano a destra e sinistra, sempre col davanti verso di noi
    v.renderer.setAnimationLoop(function(ms) {
        if (!v.visibile) return;
        occhiali.gruppo.rotation.y = Math.sin(ms / 2600) * 0.75;
        v.renderer.render(v.scena, v.camera);
    });

    // costruisco le card del row
    const row = document.getElementById('colori-row');
    const scelte = {};   // per ogni parte: { scelto, campioni, libero }

    PARTI.forEach(function(parte) {
        const card = document.createElement('div');
        card.className = 'parte';
        card.innerHTML =
            '<div class="parte-testa"><span class="parte-nome">' + parte.nome + '</span>' +
            '<span class="parte-scelto"></span></div><div class="campioni"></div>';
        const scelto = card.querySelector('.parte-scelto');
        const contenitore = card.querySelector('.campioni');

        const bottoni = parte.campioni.map(function([nome, colore], i) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'campione' + (i === parte.iniziale ? ' selected' : '');
            b.style.background = colore;
            b.title = nome;
            b.setAttribute('aria-label', parte.nome + ': ' + nome);
            b.addEventListener('click', function() { applica(parte.id, colore, nome); });
            contenitore.appendChild(b);
            return b;
        });

        // un colore a scelta libera
        const libero = document.createElement('label');
        libero.className = 'campione campione-libero';
        libero.title = 'Colore libero';
        libero.innerHTML = '<input type="color" aria-label="' + parte.nome + ': colore libero">';
        const input = libero.querySelector('input');
        input.value = parte.campioni[parte.iniziale][1];
        input.addEventListener('input', function() { applica(parte.id, input.value, 'Colore libero · ' + input.value.toUpperCase()); });
        contenitore.appendChild(libero);

        // la finitura (solo per il frontale)
        if (parte.finiture) {
            const fila = document.createElement('div');
            fila.className = 'finiture';
            parte.finiture.forEach(function(nome, i) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'finitura' + (i === 0 ? ' selected' : '');
                b.textContent = nome;
                b.addEventListener('click', function() { applicaFinitura(nome); });
                fila.appendChild(b);
            });
            card.appendChild(fila);
        }

        scelto.textContent = parte.campioni[parte.iniziale][0];
        scelte[parte.id] = { parte, scelto, bottoni, libero, input };
        row.appendChild(card);
    });

    function applica(id, colore, nome) {
        materiali[id].color.set(colore);
        const s = scelte[id];
        s.scelto.textContent = nome;
        // seleziono il campione con quel colore (o il cerchio libero se non c'è)
        let trovato = false;
        s.bottoni.forEach(function(b, i) {
            const uguale = s.parte.campioni[i][1].toLowerCase() === colore.toLowerCase();
            b.classList.toggle('selected', uguale);
            if (uguale) trovato = true;
        });
        s.libero.classList.toggle('selected', !trovato);
        if (trovato) s.input.value = colore;
        configurazione[id] = { nome: nome, colore: colore };
        aggiornaRiepilogo();
        aggiornaFoto();
    }

    function applicaFinitura(nome) {
        impostaFinitura(nome);
        row.querySelectorAll('.finitura').forEach(function(b) {
            b.classList.toggle('selected', b.textContent === nome);
        });
        configurazione.finitura = nome;
        aggiornaRiepilogo();
        aggiornaFoto();
    }

    // le combinazioni
    const combinazioni = document.getElementById('combinazioni');
    COMBINAZIONI.forEach(function(c) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'combinazione';
        b.innerHTML = '<span class="combinazione-pallini">' +
            c.colori.map(function(col) { return '<i style="background:' + col + '"></i>'; }).join('') +
            '</span>' + c.nome;
        b.addEventListener('click', function() {
            PARTI.forEach(function(parte, i) {
                const campione = parte.campioni.find(function(x) { return x[1] === c.colori[i]; });
                applica(parte.id, c.colori[i], campione ? campione[0] : c.colori[i]);
            });
            applicaFinitura(c.finitura);
        });
        combinazioni.appendChild(b);
    });
}


// ===== la borsa: compra e spedisci =====

// quello che hai scelto nel row dei colori (si aggiorna a ogni scelta)
const configurazione = { finitura: 'Trasparente' };
PARTI.forEach(function(parte) {
    const [nome, colore] = parte.campioni[parte.iniziale];
    configurazione[parte.id] = { nome: nome, colore: colore };
});

const PREZZO_OCCHIALI = 149;
const SPEDIZIONI = {
    standard: { nome: 'Standard', prezzo: 0, giorni: [3, 5] },
    express:  { nome: 'Express',  prezzo: 9.9, giorni: [1, 2] }
};
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

// la riga sotto il row dei colori: "Frontale Fumo trasparente · Stanghette Nero · Cerniere Argento"
function testoConfigurazione() {
    return 'Frontale ' + configurazione.frontale.nome + ' ' + configurazione.finitura.toLowerCase() +
        ' · Stanghette ' + configurazione.stanghette.nome + ' · Cerniere ' + configurazione.cerniere.nome;
}
function aggiornaRiepilogo() {
    const el = document.getElementById('compra-config');
    if (el) el.textContent = testoConfigurazione();
}

// aggiunge giorni lavorativi (salta sabato e domenica)
function giorniLavorativi(da, quanti) {
    const d = new Date(da);
    while (quanti > 0) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0 && d.getDay() !== 6) quanti--;
    }
    return d;
}
const data = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

// la borsa: un elenco di articoli { chiave, nome, dettaglio, prezzo, quantita, foto | svg }
// (due occhiali con gli stessi colori sono lo stesso articolo: aumenta la quantità)
const borsa = [];

function aggiungiAllaBorsa(articolo) {
    const uguale = borsa.find(function(a) { return a.chiave === articolo.chiave; });
    if (uguale) uguale.quantita = Math.min(9, uguale.quantita + 1);
    else borsa.push(Object.assign({ quantita: 1 }, articolo));
    aggiornaContatore();
}

function aggiornaContatore() {
    const n = borsa.reduce(function(s, a) { return s + a.quantita; }, 0);
    document.querySelectorAll('.borsa-numero').forEach(function(el) {
        el.textContent = n;
        el.hidden = n === 0;
    });
}

function avviaCompra() {
    const cassa = document.getElementById('cassa');
    const passi = cassa.querySelectorAll('[data-passo]');
    const indicatori = cassa.querySelectorAll('.cassa-indicatore li');
    const modulo = document.getElementById('cassa-modulo');
    const lista = document.getElementById('cassa-articoli');
    const vuota = document.getElementById('cassa-vuota');
    const avanti = cassa.querySelector('[data-avanti]');

    function vaiAlPasso(n) {
        passi.forEach(function(p) { p.hidden = Number(p.dataset.passo) !== n; });
        indicatori.forEach(function(li, i) {
            li.classList.toggle('fatto', i + 1 < n);
            li.classList.toggle('attivo', i + 1 === n);
        });
        cassa.scrollTop = 0;
    }

    function spedizioneScelta() {
        return SPEDIZIONI[modulo.querySelector('input[name="spedizione"]:checked').value];
    }

    function aggiornaTotali() {
        const sped = spedizioneScelta();
        const subtotale = borsa.reduce(function(s, a) { return s + a.prezzo * a.quantita; }, 0);
        cassa.querySelectorAll('.cassa-subtotale').forEach(function(el) { el.textContent = euro.format(subtotale); });
        cassa.querySelectorAll('.cassa-costo-spedizione').forEach(function(el) {
            el.textContent = sped.prezzo === 0 ? 'Gratuita' : euro.format(sped.prezzo);
        });
        cassa.querySelectorAll('.cassa-totale').forEach(function(el) { el.textContent = euro.format(subtotale + sped.prezzo); });

        // le date di consegna accanto alle due spedizioni
        Object.keys(SPEDIZIONI).forEach(function(chiave) {
            const s = SPEDIZIONI[chiave];
            const da = giorniLavorativi(new Date(), s.giorni[0]);
            const a = giorniLavorativi(new Date(), s.giorni[1]);
            modulo.querySelector('[data-arrivo="' + chiave + '"]').textContent =
                'Arriva tra ' + data.format(da) + ' e ' + data.format(a);
        });
    }

    // disegna gli articoli della borsa (passo 1)
    function disegnaBorsa() {
        lista.innerHTML = '';
        borsa.forEach(function(a) {
            const li = document.createElement('li');
            li.className = 'articolo';
            li.innerHTML =
                '<div class="articolo-figura"></div>' +
                '<div class="articolo-testo">' +
                    '<p class="articolo-nome"></p><p class="articolo-dettaglio"></p>' +
                    '<div class="cassa-quantita">' +
                        '<button type="button" data-meno aria-label="Uno in meno">−</button>' +
                        '<strong></strong>' +
                        '<button type="button" data-piu aria-label="Uno in più">+</button>' +
                        '<button type="button" class="link articolo-togli">Rimuovi</button>' +
                    '</div>' +
                '</div>' +
                '<p class="articolo-prezzo"></p>';

            const figura = li.querySelector('.articolo-figura');
            if (a.foto) {
                const img = document.createElement('img');
                img.src = a.foto;
                img.alt = '';
                figura.appendChild(img);
            } else if (a.svg) {
                figura.innerHTML = a.svg;
            }
            li.querySelector('.articolo-nome').textContent = a.nome;
            li.querySelector('.articolo-dettaglio').textContent = a.dettaglio;
            li.querySelector('strong').textContent = a.quantita;
            li.querySelector('.articolo-prezzo').textContent = euro.format(a.prezzo * a.quantita);

            function cambia(nuova) {
                a.quantita = nuova;
                if (a.quantita <= 0) borsa.splice(borsa.indexOf(a), 1);
                disegnaBorsa();
                aggiornaTotali();
                aggiornaContatore();
            }
            li.querySelector('[data-meno]').addEventListener('click', function() { cambia(a.quantita - 1); });
            li.querySelector('[data-piu]').addEventListener('click', function() { cambia(Math.min(9, a.quantita + 1)); });
            li.querySelector('.articolo-togli').addEventListener('click', function() { cambia(0); });
            lista.appendChild(li);
        });
        vuota.hidden = borsa.length > 0;
        avanti.disabled = borsa.length === 0;
    }

    function apri() {
        disegnaBorsa();
        aggiornaTotali();
        vaiAlPasso(1);
        if (!cassa.open) cassa.showModal();
    }

    // "Compra" degli occhiali: metto in borsa gli occhiali con i colori scelti adesso
    // "Aggiungi alla borsa" delle AirPods: leggo nome e prezzo dal bottone (data-nome, data-prezzo)
    document.querySelectorAll('[data-compra]').forEach(function(b) {
        b.addEventListener('click', function(e) {
            e.preventDefault();
            if (b.dataset.compra === 'occhiali') {
                const foto = document.querySelector('.foto img[data-vista="treQuarti"]');
                aggiungiAllaBorsa({
                    chiave: 'occhiali|' + testoConfigurazione(),
                    nome: 'Occhiali 3D Franci',
                    dettaglio: testoConfigurazione(),
                    prezzo: PREZZO_OCCHIALI,
                    foto: foto && foto.src ? foto.src : null
                });
            } else {
                const disegno = b.closest('.prodotto').querySelector('svg');
                aggiungiAllaBorsa({
                    chiave: b.dataset.id,
                    nome: b.dataset.nome,
                    dettaglio: 'Custodia di ricarica USB‑C inclusa',
                    prezzo: Number(b.dataset.prezzo),
                    svg: disegno ? disegno.outerHTML : ''
                });
            }
            apri();
        });
    });
    document.querySelectorAll('[data-borsa]').forEach(function(b) {
        b.addEventListener('click', apri);
    });

    cassa.querySelectorAll('[data-chiudi]').forEach(function(b) {
        b.addEventListener('click', function() { cassa.close(); });
    });
    // clic fuori dalla finestra = chiudi
    cassa.addEventListener('click', function(e) { if (e.target === cassa) cassa.close(); });

    avanti.addEventListener('click', function() { if (borsa.length) vaiAlPasso(2); });
    cassa.querySelector('[data-indietro]').addEventListener('click', function() { vaiAlPasso(1); });
    modulo.addEventListener('change', aggiornaTotali);

    // "Conferma e spedisci": il browser controlla i campi obbligatori, poi mostro la conferma
    modulo.addEventListener('submit', function(e) {
        e.preventDefault();
        const campi = new FormData(modulo);
        const sped = spedizioneScelta();
        const numero = 'FR-' + Date.now().toString(36).toUpperCase().slice(-6);

        document.getElementById('conferma-numero').textContent = numero;
        document.getElementById('conferma-nome').textContent = campi.get('nome');
        document.getElementById('conferma-indirizzo').textContent =
            campi.get('indirizzo') + ', ' + campi.get('cap') + ' ' + campi.get('citta') + ' (' + campi.get('provincia').toUpperCase() + ')';
        document.getElementById('conferma-email').textContent = campi.get('email');
        document.getElementById('conferma-arrivo').textContent =
            sped.nome + ' · ' + modulo.querySelector('[data-arrivo="' + campi.get('spedizione') + '"]').textContent.toLowerCase();
        document.getElementById('conferma-articoli').textContent = borsa.map(function(a) {
            return a.quantita + ' × ' + a.nome;
        }).join(', ');

        vaiAlPasso(3);
    });

    // dopo un ordine confermato la borsa si svuota
    cassa.addEventListener('close', function() {
        if (!passi[2].hidden) {
            borsa.length = 0;
            modulo.reset();
            aggiornaContatore();
        }
    });

    aggiornaRiepilogo();
}


// ===== i dettagli: le misure lette dal modello =====

function avviaDettagli(sorgente) {
    sorgente.updateMatrixWorld(true);
    const frontale = new THREE.Box3().setFromObject(sorgente.getObjectByName('lente')).getSize(new THREE.Vector3());

    let stanghetta = 0;
    sorgente.getObjectByName('aste').children.forEach(function(pezzo) {
        const misura = new THREE.Box3().setFromObject(pezzo).getSize(new THREE.Vector3());
        if (misura.z > 0.1) stanghetta = Math.max(stanghetta, misura.z);   // le stanghette sono i pezzi lunghi
    });

    // il modello è in metri: × 1000 = millimetri
    const valori = { larghezza: frontale.x, altezza: frontale.y, stanghetta: stanghetta };
    document.querySelectorAll('[data-misura]').forEach(function(el) {
        el.textContent = Math.round(valori[el.dataset.misura] * 1000);
    });
}


// ===== provali: gli occhiali sul tuo viso (fotocamera o foto) =====
//
// MediaPipe Face Landmarker trova 478 punti sul viso. Ne uso pochi:
//   33 / 263   gli angoli esterni degli occhi   -> dove stanno, quanto sono larghi, come è girata la testa
//   133 / 362  gli angoli interni degli occhi
//   10 / 152   la fronte e il mento             -> dov'è "su"
// Gli occhiali si disegnano con una camera ortografica grande quanto l'immagine,
// e una "testa" invisibile (un ellissoide) nasconde le stanghette quando passano dietro.

const MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELLO_VISO = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const LARGHEZZA_SUL_VISO = 1.6;   // il frontale è 1,6 volte la distanza tra gli angoli esterni degli occhi

function avviaProva(sorgente) {
    const palco = document.getElementById('prova-palco');
    const canvas = document.getElementById('prova-canvas');
    const vuoto = document.getElementById('prova-vuoto');
    const stato = document.getElementById('prova-stato');
    const bCamera = document.getElementById('prova-camera');
    const bSpegni = document.getElementById('prova-spegni');
    const bScatta = document.getElementById('prova-scatta');
    const inputFoto = document.getElementById('prova-foto');
    const taglia = document.getElementById('prova-taglia');
    const tagliaValore = document.getElementById('prova-taglia-valore');

    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(1);   // il canvas è già grande quanto l'immagine
    const scena = creaScena(renderer, '#000000');
    scena.background = null;
    const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10000, 10000);
    camera.position.z = 5000;

    // gli occhiali, spostati in modo che il punto d'aggancio sia tra le lenti, all'altezza degli occhi
    const occhiali = creaOcchiali(sorgente);
    occhiali.gruppo.updateMatrixWorld(true);
    const scatolaLenti = new THREE.Box3().setFromObject(occhiali.gruppo.getObjectByName('lente'));
    const centroLenti = scatolaLenti.getCenter(new THREE.Vector3());
    const larghezzaFrontale = scatolaLenti.getSize(new THREE.Vector3()).x;
    occhiali.gruppo.position.set(-centroLenti.x, -centroLenti.y, -(scatolaLenti.max.z - 0.3));

    const aggancio = new THREE.Group();
    aggancio.add(occhiali.gruppo);
    aggancio.visible = false;
    scena.add(aggancio);

    // la testa invisibile: scrive solo la profondità, così quello che c'è dietro non si vede
    const testa = new THREE.Mesh(
        new THREE.SphereGeometry(1, 32, 24),
        new THREE.MeshBasicMaterial({ colorWrite: false })
    );
    testa.scale.set(0.74, 1.3, 1.35);
    testa.position.set(0, 0.3, -1.45);
    testa.renderOrder = -1;
    aggancio.add(testa);

    let landmarker = null;
    let modo = null;        // 'camera' | 'foto' | null
    let flusso = null;      // lo stream della fotocamera
    let ultimoTempo = -1;
    let scatto = false;
    let posa = null;        // l'ultima posizione trovata { posizione, rotazione, scala }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    function scriviStato(testo) {
        stato.hidden = !testo;
        stato.textContent = testo || '';
    }

    async function caricaLandmarker() {
        if (landmarker) return landmarker;
        scriviStato('Carico il riconoscimento del viso…');
        const { FaceLandmarker, FilesetResolver } = await import(MEDIAPIPE + '/vision_bundle.mjs');
        const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE + '/wasm');
        landmarker = await FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODELLO_VISO, delegate: 'GPU' },
            runningMode: 'VIDEO',
            numFaces: 1
        });
        return landmarker;
    }

    // il canvas prende le proporzioni dell'immagine (al massimo 1280 px di larghezza)
    function dimensiona(w, h) {
        const k = Math.min(1, 1280 / w);
        const W = Math.round(w * k), H = Math.round(h * k);
        renderer.setSize(W, H, false);
        camera.right = W;
        camera.bottom = -H;
        camera.updateProjectionMatrix();
        palco.style.aspectRatio = W + ' / ' + H;
    }

    // dai punti del viso: dove mettere gli occhiali, come girarli, quanto farli grandi
    const asseX = new THREE.Vector3(), asseY = new THREE.Vector3(), asseZ = new THREE.Vector3();
    const matrice = new THREE.Matrix4();
    function calcolaPosa(punti) {
        const W = camera.right, H = -camera.bottom;
        // da coordinate dell'immagine (0–1, y in giù) a coordinate della scena (pixel, y in su, z verso di noi)
        const P = function(i) { return new THREE.Vector3(punti[i].x * W, -punti[i].y * H, -punti[i].z * W); };

        const esternoSx = P(33), esternoDx = P(263);
        const occhioSx = esternoSx.clone().add(P(133)).multiplyScalar(0.5);
        const occhioDx = esternoDx.clone().add(P(362)).multiplyScalar(0.5);
        const centro = occhioSx.add(occhioDx).multiplyScalar(0.5);

        asseX.subVectors(esternoDx, esternoSx);
        const distanzaOcchi = asseX.length();
        asseX.normalize();
        const su = P(10).sub(P(152));
        asseZ.crossVectors(asseX, su).normalize();
        asseY.crossVectors(asseZ, asseX).normalize();
        matrice.makeBasis(asseX, asseY, asseZ);

        return {
            posizione: centro,
            rotazione: new THREE.Quaternion().setFromRotationMatrix(matrice),
            scala: distanzaOcchi * LARGHEZZA_SUL_VISO / larghezzaFrontale
        };
    }

    function applicaPosa(nuova, morbidezza) {
        if (!nuova) {
            aggancio.visible = false;
            return;
        }
        if (!posa || !aggancio.visible || morbidezza === 1) {
            posa = nuova;
        } else {
            // in video la posa si ammorbidisce un po', così gli occhiali non tremano
            posa.posizione.lerp(nuova.posizione, morbidezza);
            posa.rotazione.slerp(nuova.rotazione, morbidezza);
            posa.scala += (nuova.scala - posa.scala) * morbidezza;
        }
        aggancio.visible = true;
        aggancio.position.copy(posa.posizione);
        aggancio.quaternion.copy(posa.rotazione);
        aggancio.scale.setScalar(posa.scala * Number(taglia.value) / 100);
    }

    // ---- la fotocamera ----
    bCamera.addEventListener('click', async function() {
        try {
            bCamera.disabled = true;
            scriviStato('Chiedo il permesso per la fotocamera…');
            flusso = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
            video.srcObject = flusso;
            await video.play();
            await caricaLandmarker();
            await landmarker.setOptions({ runningMode: 'VIDEO' });

            dimensiona(video.videoWidth, video.videoHeight);
            const textura = new THREE.VideoTexture(video);
            textura.colorSpace = THREE.SRGBColorSpace;
            scena.background = textura;

            modo = 'camera';
            posa = null;
            palco.classList.add('attivo', 'specchio');
            vuoto.hidden = true;
            bScatta.disabled = false;
            bSpegni.hidden = false;
            scriviStato('');
        } catch (errore) {
            console.error(errore);
            spegniCamera();
            scriviStato('Non riesco a usare la fotocamera. Controlla il permesso nel browser (e apri la pagina da Live Server).');
        } finally {
            bCamera.disabled = false;
        }
    });

    function spegniCamera() {
        if (flusso) flusso.getTracks().forEach(function(t) { t.stop(); });
        flusso = null;
        if (modo === 'camera') {
            modo = null;
            scena.background = null;
            aggancio.visible = false;
            palco.classList.remove('attivo', 'specchio');
            vuoto.hidden = false;
            bScatta.disabled = true;
        }
        bSpegni.hidden = true;
    }
    bSpegni.addEventListener('click', function() { spegniCamera(); scriviStato(''); });

    // ---- una foto caricata ----
    inputFoto.addEventListener('change', async function() {
        const file = inputFoto.files[0];
        if (!file) return;
        spegniCamera();
        const img = new Image();
        img.src = URL.createObjectURL(file);
        try {
            await img.decode();
            await caricaLandmarker();
            await landmarker.setOptions({ runningMode: 'IMAGE' });

            dimensiona(img.naturalWidth, img.naturalHeight);
            const textura = new THREE.Texture(img);
            textura.colorSpace = THREE.SRGBColorSpace;
            textura.needsUpdate = true;
            scena.background = textura;

            modo = 'foto';
            palco.classList.add('attivo');
            palco.classList.remove('specchio');
            vuoto.hidden = true;
            bScatta.disabled = false;

            const risultato = landmarker.detect(img);
            const punti = risultato.faceLandmarks[0];
            applicaPosa(punti ? calcolaPosa(punti) : null, 1);
            scriviStato(punti ? '' : 'In questa foto non trovo un viso. Prova con una foto di fronte.');
        } catch (errore) {
            console.error(errore);
            scriviStato('Non riesco a leggere questa foto.');
        }
        inputFoto.value = '';
    });

    // ---- la taglia ----
    taglia.addEventListener('input', function() {
        const v = Number(taglia.value);
        tagliaValore.textContent = v < 94 ? 'S' : v > 108 ? 'L' : 'M';
        if (posa) aggancio.scale.setScalar(posa.scala * v / 100);
    });

    // ---- salva la foto ----
    bScatta.addEventListener('click', function() { scatto = true; });
    function salva() {
        const link = document.createElement('a');
        link.download = 'occhiali-3d-franci-prova.jpg';
        link.href = canvas.toDataURL('image/jpeg', 0.92);
        link.click();
    }

    // ---- a ogni fotogramma ----
    let visibile = false;
    new IntersectionObserver(function(voci) { visibile = voci[0].isIntersecting; }).observe(palco);

    renderer.setAnimationLoop(function() {
        if (!modo || !visibile) return;

        if (modo === 'camera' && landmarker && video.readyState >= 2 && video.currentTime !== ultimoTempo) {
            ultimoTempo = video.currentTime;
            const risultato = landmarker.detectForVideo(video, performance.now());
            const punti = risultato.faceLandmarks[0];
            applicaPosa(punti ? calcolaPosa(punti) : null, 0.55);
            scriviStato(punti ? '' : 'Non vedo il tuo viso: mettiti davanti alla fotocamera.');
        }

        occhiali.apri(1);
        renderer.render(scena, camera);

        // il canvas si legge subito dopo averlo disegnato (dopo verrebbe svuotato)
        if (scatto) {
            scatto = false;
            salva();
        }
    });
}


// ===== ascolta: Spotify e la vibrazione nelle cuffie =====
//
// Spotify: uso il lettore ufficiale di Spotify (iFrame API), che non ha bisogno di chiavi.
// Il lettore mi dice quando la musica parte o si ferma: così gli occhiali "suonano"
// (le onde si muovono) e parte la vibrazione.
//
// La vibrazione nelle cuffie: Spotify non mi fa leggere il suono, quindi il ritmo lo scegli tu (bpm).
// A ogni battito suono un colpo di bassi molto basso (da 70 a 40 Hz) con la Web Audio API:
// nelle cuffie si sente come una vibrazione. Sul telefono (Android) vibra anche il telefono.

// il Client ID della tua app Spotify (developer.spotify.com/dashboard): incollalo tra le virgolette
const SPOTIFY_CLIENT_ID = '54bc957579dd4d01b17a1885f75a072d';

const PLAYLIST = [
    { nome: 'Top 50 Italia',     uri: 'spotify:playlist:37i9dQZEVXbIQnj7RRhdSX' },
    { nome: "Today's Top Hits",  uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M' },
    { nome: 'Lofi Beats',        uri: 'spotify:playlist:37i9dQZF1DWWQRwui0ExPn' }
];

// accetta sia "https://open.spotify.com/track/..." sia "spotify:track:..."
function uriDaLink(testo) {
    testo = testo.trim();
    if (/^spotify:(track|album|playlist|episode|show|artist):[A-Za-z0-9]+$/.test(testo)) return testo;
    const m = testo.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/);
    return m ? 'spotify:' + m[1] + ':' + m[2] : null;
}

// --- la vibrazione (si usa anche dai bottoni "Prova la vibrazione" delle AirPods) ---
const FORZE = { leggera: 0.35, media: 0.65, forte: 1 };
const vibrazione = { attiva: true, forza: 'media', bpm: 110 };
let audio = null;

function preparaAudio() {
    // il browser fa partire l'audio solo dopo un clic: lo creo (o lo risveglio) nei clic
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
}

function battito() {
    const forza = FORZE[vibrazione.forza];

    // il telefono vibra (dove si può: Android; su iPhone il browser non lo permette)
    if (navigator.vibrate) navigator.vibrate(Math.round(25 + 55 * forza));

    // nelle cuffie: un "tum" di bassi che scende da 70 a 40 Hz in un attimo
    if (audio) {
        const t = audio.currentTime;
        const onda = audio.createOscillator();
        const volume = audio.createGain();
        onda.type = 'sine';
        onda.frequency.setValueAtTime(70, t);
        onda.frequency.exponentialRampToValueAtTime(40, t + 0.16);
        volume.gain.setValueAtTime(0.0001, t);
        volume.gain.exponentialRampToValueAtTime(0.6 * forza, t + 0.012);
        volume.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        onda.connect(volume).connect(audio.destination);
        onda.start(t);
        onda.stop(t + 0.22);
    }

    // e si vede: gli occhiali e le AirPods tremano
    document.querySelectorAll('.vibra-bersaglio').forEach(function(el) {
        el.classList.remove('vibra');
        void el.offsetWidth;   // trucco per far ripartire l'animazione CSS
        el.classList.add('vibra');
        el.style.setProperty('--forza', forza);
    });
}

// 4 battiti di prova
function provaVibrazione() {
    preparaAudio();
    for (let i = 0; i < 4; i++) setTimeout(battito, i * 60000 / vibrazione.bpm);
}

function avviaAscolta() {
    const figura = document.getElementById('ascolta-figura');
    const foto = document.getElementById('ascolta-foto');
    const statoOcchiali = document.getElementById('ascolta-stato');
    const statoSpotify = document.getElementById('spotify-stato');
    const inizio = document.getElementById('spotify-inizio');
    const collegato = document.getElementById('spotify-collegato');
    const bCollega = document.getElementById('spotify-collega');
    const playlist = document.getElementById('spotify-playlist');
    const moduloLink = document.getElementById('spotify-link');
    const errore = document.getElementById('spotify-errore');

    // la foto degli occhiali: la stessa di tre quarti, con i colori scelti
    const fotoTreQuarti = document.querySelector('.foto img[data-vista="treQuarti"]');
    function copiaFoto() { if (fotoTreQuarti.src) foto.src = fotoTreQuarti.src; }
    new MutationObserver(copiaFoto).observe(fotoTreQuarti, { attributes: true, attributeFilter: ['src'] });
    copiaFoto();

    let lettore = null;
    let suona = false;
    let timer = null;

    function aggiornaRitmo() {
        clearInterval(timer);
        timer = null;
        if (vibrazione.attiva && suona) timer = setInterval(battito, 60000 / vibrazione.bpm);
    }

    function impostaSuona(si) {
        if (si === suona) return;
        suona = si;
        figura.classList.toggle('suona', si);
        statoOcchiali.textContent = si ? 'Occhiali 3D Franci · in riproduzione' : 'Occhiali 3D Franci · collegati';
        aggiornaRitmo();
    }

    // ---- collega Spotify: carico il lettore ufficiale solo adesso ----
    bCollega.addEventListener('click', function() {
        preparaAudio();
        bCollega.disabled = true;
        bCollega.textContent = 'Mi collego…';

        window.onSpotifyIframeApiReady = function(api) {
            const posto = document.getElementById('spotify-embed');
            api.createController(posto, { uri: PLAYLIST[0].uri, width: '100%', height: 352 }, function(controller) {
                lettore = controller;
                controller.addListener('ready', function() {
                    inizio.hidden = true;
                    collegato.hidden = false;
                    statoSpotify.textContent = 'Collegato';
                    statoSpotify.classList.add('si');
                    figura.classList.add('collegati');
                    statoOcchiali.textContent = 'Occhiali 3D Franci · collegati';
                });
                controller.addListener('playback_update', function(e) {
                    impostaSuona(!e.data.isPaused && !e.data.isBuffering);
                });
            });
        };

        const script = document.createElement('script');
        script.src = 'https://open.spotify.com/embed/iframe-api/v1';
        script.async = true;
        script.onerror = function() {
            bCollega.disabled = false;
            bCollega.textContent = 'Riprova';
            statoSpotify.textContent = 'Non riesco a collegarmi (serve internet)';
        };
        document.body.appendChild(script);
    });

    // ---- le playlist pronte ----
    PLAYLIST.forEach(function(p, i) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'playlist-voce' + (i === 0 ? ' selected' : '');
        b.textContent = p.nome;
        b.addEventListener('click', function() {
            suonaUri(p.uri);
            playlist.querySelectorAll('.playlist-voce').forEach(function(x) { x.classList.toggle('selected', x === b); });
        });
        playlist.appendChild(b);
    });

    function suonaUri(uri) {
        if (!lettore) return;
        preparaAudio();
        lettore.loadUri(uri);
        lettore.play();
    }

    // ---- un link incollato ----
    moduloLink.addEventListener('submit', function(e) {
        e.preventDefault();
        const uri = uriDaLink(moduloLink.link.value);
        errore.hidden = !!uri;
        if (!uri) return;
        playlist.querySelectorAll('.playlist-voce').forEach(function(x) { x.classList.remove('selected'); });
        suonaUri(uri);
        moduloLink.reset();
    });

    // ---- i comandi della vibrazione ----
    const interruttore = document.getElementById('vibra-interruttore');
    interruttore.addEventListener('click', function() {
        preparaAudio();
        vibrazione.attiva = !vibrazione.attiva;
        interruttore.setAttribute('aria-checked', vibrazione.attiva);
        aggiornaRitmo();
    });

    const forze = document.querySelectorAll('#vibra-intensita button');
    forze.forEach(function(b) {
        b.addEventListener('click', function() {
            preparaAudio();
            vibrazione.forza = b.dataset.forza;
            forze.forEach(function(x) { x.classList.toggle('selected', x === b); });
            battito();   // senti subito com'è
        });
    });

    const bpm = document.getElementById('vibra-bpm');
    const bpmValore = document.getElementById('vibra-bpm-valore');
    bpm.addEventListener('input', function() {
        vibrazione.bpm = Number(bpm.value);
        bpmValore.textContent = bpm.value + ' bpm';
        aggiornaRitmo();
    });

    // ---- il TUO account Spotify (Web Playback SDK) ----
    // Gli occhiali diventano un dispositivo Spotify Connect chiamato "Occhiali 3D Franci".
    // Serve Spotify Premium e un Client ID gratuito (vedi SPOTIFY_CLIENT_ID in cima alla sezione).
    const bAccedi = document.getElementById('spotify-accedi');
    const mio = document.getElementById('spotify-mio');
    const brano = document.getElementById('spotify-brano');
    const RITORNO = location.origin + location.pathname;

    function base64url(byte) {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(byte))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    bAccedi.addEventListener('click', async function() {
        if (!SPOTIFY_CLIENT_ID) {
            statoSpotify.textContent = 'Manca il Client ID in js/occhiali.js';
            return;
        }
        // accesso "PKCE": niente password nel sito, Spotify ti chiede il permesso nella sua pagina
        const verificatore = base64url(crypto.getRandomValues(new Uint8Array(48)));
        sessionStorage.setItem('spotify_verificatore', verificatore);
        const sfida = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificatore)));
        location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
            client_id: SPOTIFY_CLIENT_ID,
            response_type: 'code',
            redirect_uri: RITORNO,
            code_challenge_method: 'S256',
            code_challenge: sfida,
            scope: 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state'
        });
    });

    // tornando da Spotify l'indirizzo ha ?code=...: lo scambio con il "token" per usare il tuo account
    const codice = new URLSearchParams(location.search).get('code');
    if (codice) collegaMioSpotify(codice);

    async function collegaMioSpotify(codice) {
        history.replaceState(null, '', RITORNO + '#ascolta');
        statoSpotify.textContent = 'Mi collego al tuo account…';
        const risposta = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: SPOTIFY_CLIENT_ID,
                grant_type: 'authorization_code',
                code: codice,
                redirect_uri: RITORNO,
                code_verifier: sessionStorage.getItem('spotify_verificatore') || ''
            })
        }).then(function(r) { return r.json(); });
        const token = risposta.access_token;
        if (!token) { statoSpotify.textContent = 'Accesso non riuscito, riprova'; return; }

        window.onSpotifyWebPlaybackSDKReady = function() {
            const player = new Spotify.Player({
                name: 'Occhiali 3D Franci',
                getOAuthToken: function(cb) { cb(token); },
                volume: 0.8
            });
            player.addListener('ready', function(e) {
                // sposto la musica sugli occhiali
                fetch('https://api.spotify.com/v1/me/player', {
                    method: 'PUT',
                    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ device_ids: [e.device_id], play: false })
                });
                inizio.hidden = true;
                mio.hidden = false;
                statoSpotify.textContent = 'Collegato al tuo Spotify';
                statoSpotify.classList.add('si');
                figura.classList.add('collegati');
                statoOcchiali.textContent = 'Occhiali 3D Franci · dispositivo Spotify';
            });
            player.addListener('player_state_changed', function(s) {
                if (!s) return;
                impostaSuona(!s.paused);
                const t = s.track_window.current_track;
                brano.textContent = t.name + ' — ' + t.artists.map(function(a) { return a.name; }).join(', ');
            });
            player.addListener('account_error', function() { statoSpotify.textContent = 'Serve Spotify Premium'; });
            player.addListener('authentication_error', function() { statoSpotify.textContent = 'Accesso scaduto, accedi di nuovo'; });

            mio.querySelectorAll('[data-comando]').forEach(function(b) {
                b.addEventListener('click', function() {
                    preparaAudio();
                    player.activateElement();
                    player[b.dataset.comando]();
                });
            });
            player.connect();
        };
        const script = document.createElement('script');
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        document.body.appendChild(script);
    }

    // ---- la vibrazione con i messaggi ----
    // I messaggi arrivano dal modulo qui sotto o da un'altra scheda del sito (BroadcastChannel)
    const bMsg = document.getElementById('msg-interruttore');
    const moduloMsg = document.getElementById('msg-modulo');
    const avviso = document.getElementById('avviso');
    const canale = 'BroadcastChannel' in window ? new BroadcastChannel('occhiali-3d-franci') : null;
    let vibraMessaggi = true, timerAvviso = null;

    bMsg.addEventListener('click', function() {
        preparaAudio();
        vibraMessaggi = !vibraMessaggi;
        bMsg.setAttribute('aria-checked', vibraMessaggi);
    });

    function arrivaMessaggio(da, testo) {
        document.getElementById('avviso-da').textContent = da;
        document.getElementById('avviso-testo').textContent = testo;
        avviso.hidden = false;
        avviso.classList.remove('entra');
        void avviso.offsetWidth;
        avviso.classList.add('entra');
        clearTimeout(timerAvviso);
        timerAvviso = setTimeout(function() { avviso.hidden = true; }, 4500);

        if (!vibraMessaggi) return;
        battito();                      // tum...
        setTimeout(battito, 170);       // ...tum: due colpi brevi, diversi dal ritmo della musica
    }

    moduloMsg.addEventListener('submit', function(e) {
        e.preventDefault();
        preparaAudio();
        const testo = moduloMsg.testo.value.trim();
        if (!testo) return;
        moduloMsg.reset();
        if (canale) canale.postMessage({ testo: testo });
        setTimeout(function() { arrivaMessaggio('Messaggio di prova', testo); }, 2000);
    });
    if (canale) canale.onmessage = function(e) { arrivaMessaggio("Da un'altra scheda", e.data.testo); };
    avviso.addEventListener('click', function() { avviso.hidden = true; });

    // tutti i bottoni "Prova la vibrazione" (qui e nelle card delle AirPods)
    document.querySelectorAll('[data-prova-vibrazione]').forEach(function(b) {
        b.addEventListener('click', provaVibrazione);
    });
}


// ===== l'esploso: i pezzi degli occhiali si separano =====

function avviaEsploso(sorgente) {
    const el = document.querySelector('[data-visore="esploso"]');
    const v = creaVisore(el, { fov: 28 });
    const occhiali = creaOcchiali(sorgente);
    v.scena.add(occhiali.gruppo);
    v.scena.add(creaOmbra(true));
    v.alRidimensiona = function() {
        occhiali.esplodi(1);   // inquadro da esploso, così entra tutto
        inquadra(v.camera, occhiali.gruppo, new THREE.Vector3(1.1, 0.7, 1.4), 1.15);
        occhiali.esplodi(valore);
    };

    const cursore = document.getElementById('esploso-cursore');
    const bottone = document.getElementById('esploso-anima');
    const etichette = el.querySelectorAll('.etichetta');
    let valore = 0, obiettivo = 0;

    cursore.addEventListener('input', function() { obiettivo = valore = cursore.value / 100; });
    bottone.addEventListener('click', function() { obiettivo = obiettivo > 0.5 ? 0 : 1; });

    const p = new THREE.Vector3();
    v.renderer.setAnimationLoop(function(ms) {
        if (!v.visibile) return;
        valore += (obiettivo - valore) * 0.06;
        occhiali.esplodi(morbido(valore));
        occhiali.gruppo.rotation.y = Math.sin(ms / 4000) * 0.25;
        cursore.value = Math.round(valore * 100);
        bottone.textContent = obiettivo > 0.5 ? 'Rimonta' : 'Separa i pezzi';
        v.renderer.render(v.scena, v.camera);

        // le etichette seguono i pezzi (proietto il centro di ogni pezzo sullo schermo)
        etichette.forEach(function(et) {
            new THREE.Box3().setFromObject(occhiali.parti[et.dataset.parte]).getCenter(p).project(v.camera);
            et.style.transform = 'translate(' + ((p.x + 1) / 2 * el.clientWidth) + 'px,' + ((1 - p.y) / 2 * el.clientHeight) + 'px)';
            et.style.opacity = limita((valore - 0.4) * 3);
        });
    });
}


// ===== luce: lenti fotocromatiche e luminescenza al buio =====
//
// "luce" va da 0 (buio) a 1 (sole). Da lì:
//   - le lenti si scuriscono quando c'è tanta luce (come le lenti fotocromatiche)
//   - stanghette e cerniere si illuminano quando è buio (fosforescenti)
// La luce si misura dalla fotocamera (luminosità media dell'immagine) o col cursore.
// Questo visore ha materiali suoi (copie): l'effetto resta qui, ma i colori scelti valgono.

const COLORE_BAGLIORE = new THREE.Color('#7dffcf');   // il verde-azzurro delle cose fosforescenti
const LENTE_NERA = new THREE.Color('#000000');
const LENTE_CHIARA = new THREE.Color('#ffffff');

function avviaLuce(sorgente) {
    const el = document.querySelector('[data-visore="luce"]');
    const v = creaVisore(el, { fov: 28 });
    const occhiali = creaOcchiali(sorgente);
    v.scena.add(occhiali.gruppo);
    const ombra = creaOmbra(true);
    v.scena.add(ombra);
    v.alRidimensiona = function() {
        inquadra(v.camera, occhiali.gruppo, new THREE.Vector3(0.9, 0.45, 1.3), 1.35);
    };

    // le copie dei materiali, solo per questo visore
    const propri = {};
    Object.keys(materiali).forEach(function(k) { propri[k] = materiali[k].clone(); });
    occhiali.gruppo.traverse(function(o) {
        if (!o.isMesh) return;
        Object.keys(materiali).forEach(function(k) { if (o.material === materiali[k]) o.material = propri[k]; });
    });

    // l'alone luminoso dietro gli occhiali (un cerchio sfumato che si somma alla luce)
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const sf = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    sf.addColorStop(0, 'rgba(255,255,255,1)');
    sf.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sf;
    g.fillRect(0, 0, 128, 128);
    const alone = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c), color: COLORE_BAGLIORE,
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0
    }));
    alone.scale.set(4.2, 2.6, 1);
    alone.position.set(0, 0, -1.2);
    v.scena.add(alone);

    const luci = v.scena.children.filter(function(o) { return o.isLight; });
    const intensita = luci.map(function(l) { return l.intensity; });
    const NOTTE = new THREE.Color('#05060a'), GIORNO = new THREE.Color('#f5f5f7');

    const cursore = document.getElementById('luce-cursore');
    const fonte = document.getElementById('luce-fonte');
    const bCamera = document.getElementById('luce-camera');
    const testi = {
        stanza: document.getElementById('luce-stanza'),
        lenti: document.getElementById('luce-lenti'),
        bagliore: document.getElementById('luce-bagliore')
    };

    // si parte dall'ora: di sera e di notte è buio
    const ora = new Date().getHours();
    let obiettivo = (ora >= 20 || ora < 7) ? 0.05 : 0.6;
    let luce = obiettivo;
    cursore.value = Math.round(obiettivo * 100);

    // ---- la fotocamera misura la luce ----
    let flusso = null, timer = null;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const piccolo = document.createElement('canvas');
    piccolo.width = 32; piccolo.height = 24;
    const pctx = piccolo.getContext('2d', { willReadFrequently: true });

    function fermaCamera() {
        clearInterval(timer);
        if (flusso) flusso.getTracks().forEach(function(t) { t.stop(); });
        flusso = null;
        bCamera.textContent = 'Misura la luce con la fotocamera';
    }

    bCamera.addEventListener('click', async function() {
        if (flusso) { fermaCamera(); fonte.textContent = 'Luce scelta da te'; return; }
        try {
            flusso = await navigator.mediaDevices.getUserMedia({ video: { width: 160, height: 120 }, audio: false });
            video.srcObject = flusso;
            await video.play();
            bCamera.textContent = 'Spegni la fotocamera';
            fonte.textContent = 'Luce misurata dalla fotocamera, in tempo reale';
            timer = setInterval(function() {
                pctx.drawImage(video, 0, 0, 32, 24);
                const d = pctx.getImageData(0, 0, 32, 24).data;
                let somma = 0;
                for (let i = 0; i < d.length; i += 4) somma += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
                const luminosita = somma / (d.length / 4) / 255;   // 0 = nero, 1 = bianco
                obiettivo = limita((luminosita - 0.06) / 0.5);
                cursore.value = Math.round(obiettivo * 100);
            }, 250);
        } catch (e) {
            console.error(e);
            fermaCamera();
            fonte.textContent = 'Non riesco a usare la fotocamera: usa il cursore';
        }
    });

    cursore.addEventListener('input', function() {
        fermaCamera();
        obiettivo = cursore.value / 100;
        fonte.textContent = 'Luce scelta da te';
    });
    document.querySelectorAll('[data-luce]').forEach(function(b) {
        b.addEventListener('click', function() {
            fermaCamera();
            obiettivo = Number(b.dataset.luce) / 100;
            cursore.value = b.dataset.luce;
            fonte.textContent = 'Luce scelta da te';
        });
    });

    let ultimo = '';
    v.renderer.setAnimationLoop(function(ms) {
        if (!v.visibile) return;
        luce += (obiettivo - luce) * 0.04;   // le lenti vere ci mettono un po' a cambiare

        const scuro = 1 - morbido(limita(luce));                    // luce al massimo = 0 (trasparenti), buio = 1 (nere)
        const bagliore = 1 - morbido(limita((luce - 0.06) / 0.3)); // 1 = buio pieno

        // la stanza: sfondo e luci
        v.scena.background = NOTTE.clone().lerp(GIORNO, Math.pow(luce, 0.7));
        luci.forEach(function(l, i) { l.intensity = intensita[i] * (0.06 + 0.94 * luce); });
        v.scena.environmentIntensity = 0.04 + 0.86 * luce;
        ombra.material.opacity = 0.35 * luce;

        // i colori scelti + le lenti che si scuriscono
        // anche stanghette e cerniere: del loro colore con la luce, nere al buio
        propri.stanghette.color.copy(materiali.stanghette.color).lerp(LENTE_NERA, scuro);
        propri.cerniere.color.copy(materiali.cerniere.color).lerp(LENTE_NERA, scuro);
        // le lenti: trasparenti come il vetro con tanta luce, nere (e lucide) al buio
        propri.frontale.color.copy(LENTE_CHIARA).lerp(LENTE_NERA, scuro);
        propri.frontale.transmission = 0.96 * (1 - scuro);
        propri.frontale.roughness = 0.05;
        propri.frontale.clearcoat = 1;

        // la luminescenza: pulsa piano, come le cose fosforescenti
        const respiro = 0.85 + 0.15 * Math.sin(ms / 900);
        propri.stanghette.emissive.copy(COLORE_BAGLIORE);
        propri.stanghette.emissiveIntensity = 0;
        propri.cerniere.emissive.copy(COLORE_BAGLIORE);
        propri.cerniere.emissiveIntensity = 0;
        propri.frontale.emissive.copy(COLORE_BAGLIORE);
        propri.frontale.emissiveIntensity = 0;   // le lenti al buio restano nere
        alone.material.opacity = 0;

        occhiali.gruppo.rotation.y = Math.sin(ms / 3000) * 0.35;
        v.renderer.render(v.scena, v.camera);

        const testo = Math.round(luce * 100) + '|' + Math.round(scuro * 100) + '|' + Math.round(bagliore * 100);
        if (testo !== ultimo) {
            ultimo = testo;
            testi.stanza.textContent = Math.round(luce * 100) + '%';
            testi.lenti.textContent = Math.round(scuro * 100) + '%';
            testi.bagliore.textContent = Math.round(scuro * 100) + '%';
            el.closest('section').classList.toggle('buio', luce < 0.25);
        }
    });
}


// ===== il menu =====

function avviaMenu() {
    const menu = document.querySelector('.menu');
    const apri = document.querySelector('.menu-apri');
    const voci = document.getElementById('menu-voci');
    const link = voci.querySelectorAll('a');

    apri.addEventListener('click', function() {
        const aperto = voci.classList.toggle('aperto');
        apri.setAttribute('aria-expanded', aperto);
    });
    link.forEach(function(a) {
        a.addEventListener('click', function() {
            voci.classList.remove('aperto');
            apri.setAttribute('aria-expanded', false);
        });
    });

    // la linea sotto il menu appare quando si scorre
    window.addEventListener('scroll', function() {
        menu.classList.toggle('staccato', window.scrollY > 10);
    }, { passive: true });

    // la voce della sezione che si sta guardando diventa "attiva"
    const osservatore = new IntersectionObserver(function(sezioni) {
        sezioni.forEach(function(s) {
            if (!s.isIntersecting) return;
            link.forEach(function(a) {
                a.classList.toggle('attivo', a.getAttribute('href') === '#' + s.target.id);
            });
        });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main > section').forEach(function(s) { osservatore.observe(s); });
}


// ===== avvio =====

avviaMenu();
avviaCompra();
avviaAscolta();

const visori = document.querySelectorAll('[data-visore]');
visori.forEach(function(v) { v.classList.add('caricamento'); });

new GLTFLoader().load(FILE_MODELLO, function(gltf) {
    visori.forEach(function(v) { v.classList.remove('caricamento'); });
    const sorgente = gltf.scene;
    avviaEroe(sorgente);
    const aggiornaFoto = avviaFoto(sorgente);
    avviaDettagli(sorgente);
    avviaEsploso(sorgente);
    avviaGira(sorgente);
    avviaProva(sorgente);
    avviaColori(sorgente, aggiornaFoto);
    avviaLuce(sorgente);
}, undefined, function(errore) {
    console.error('Non riesco a caricare ' + FILE_MODELLO, errore);
    visori.forEach(function(v) {
        v.classList.remove('caricamento');
        v.insertAdjacentHTML('beforeend', '<p style="padding:24px">Non riesco a caricare il modello. Apri la pagina da un server locale (es. Live Server).</p>');
    });
});
