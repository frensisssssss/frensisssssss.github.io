// collezione.js – la row "Tutti gli occhiali": un modellino 3D per ogni modello della classe
// (viene caricato come modulo dall'<head> di index.html)
//
// Ogni .collezione-voce ha il suo data-modello (il file .glb) e un <canvas>.
// I modelli sono tanti: se ognuno avesse il suo renderer WebGL il browser ne bloccherebbe
// qualcuno (c'è un limite di "contesti" WebGL per pagina). Quindi uso UN solo renderer
// nascosto: disegna un modello alla volta e poi copio l'immagine nel canvas della sua voce.
//
// Tutti i modelli girano INSIEME: c'è un solo angolo in comune, uguale per tutti.
// data-rotazione (in gradi) serve solo se un modello nel file guarda dalla parte sbagliata.
// Toccando un modello si apre la finestra .zoom: lì si gira e si zooma con OrbitControls.
// Un modello si carica solo quando la sua voce arriva vicino allo schermo (o quando lo si tocca).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { creaProva } from './prova.js';
import { creaFoto } from './foto.js';

const GRANDEZZA = 2.2;          // quanto è grande ogni modello nella sua scena (come nel visore grande)
const VELOCITA = 0.5;           // giro automatico: radianti al secondo, uguale per tutti
const ANGOLO_INIZIALE = -0.6;   // si parte di tre quarti
const POSIZIONE_CAMERA = new THREE.Vector3(0, 1.4, 4);
const ZOOM_MIN = 1.2;           // nella finestra zoom: quanto ci si può avvicinare...
const ZOOM_MAX = 8;             // ...e allontanare
const PASSO_ZOOM = 0.8;         // i bottoni + e −: ogni clic avvicina/allontana del 20%

const voci = document.querySelectorAll('.collezione-voce');

if (voci.length > 0) {
    const fermo = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loader = new GLTFLoader();

    // il renderer in comune per i modellini: non sta nella pagina, serve solo per disegnare
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);

    // la "stanza" che si riflette sulle superfici lucide, in comune a tutte le scene
    const pmrem = new THREE.PMREMGenerator(renderer);
    const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // una scena con l'ambiente e le stesse luci del visore grande
    function creaScena() {
        const scena = new THREE.Scene();
        scena.environment = ambiente;
        scena.add(new THREE.AmbientLight(0xffffff, 0.4));
        const luce = new THREE.DirectionalLight(0xffffff, 1.5);
        luce.position.set(3, 5, 4);
        scena.add(luce);
        return scena;
    }

    // ----- i modellini della row -----

    // ogni voce diventa un oggetto con la sua scena e il suo perno (il modello si aggiunge dopo)
    const elenco = Array.from(voci).map(function(voce) {
        const scena = creaScena();
        const perno = new THREE.Group();   // giro lui, così il modello gira intorno al suo centro
        scena.add(perno);
        const canvas = voce.querySelector('canvas');
        const dati = {
            voce, canvas, scena, perno,
            ctx: canvas.getContext('2d'),
            visibile: false,
            modello: null,      // il modello già centrato e ingrandito
            caricamento: null   // la "promessa" del caricamento, così lo faccio una volta sola
        };
        voce.querySelector('.collezione-visore').addEventListener('click', function() {
            apriZoom(dati);
        });
        return dati;
    });

    // una camera sola per tutti i modellini: sono tutti inquadrati allo stesso modo
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.copy(POSIZIONE_CAMERA);
    camera.lookAt(0, 0, 0);

    // occhiali trasparenti più realistici: invece del "vetro" del file (transmission, che qui
    // viene bianco e lattiginoso) uso una plastica trasparente colorata e lucida.
    // impostazioni.montatura e impostazioni.lenti = "colore opacità", es. "#d6d0c4 0.55"
    // impostazioni.partiLenti = i nomi delle parti che sono lenti (cerco anche nei "genitori")
    function coloraCristallo(modello, impostazioni) {
        if (!impostazioni.montatura && !impostazioni.lenti) return;
        const nomiLenti = (impostazioni.partiLenti || '').split(' ').filter(Boolean);

        function eLente(parte) {
            for (let o = parte; o; o = o.parent) {
                if (nomiLenti.includes(o.name)) return true;
            }
            return false;
        }

        modello.traverse(function(parte) {
            if (!parte.isMesh) return;
            const valore = eLente(parte) ? impostazioni.lenti : impostazioni.montatura;
            if (!valore) return;
            const [colore, opacita] = valore.trim().split(/\s+/);
            parte.material = new THREE.MeshPhysicalMaterial({
                color: colore,
                transparent: true,
                opacity: parseFloat(opacita),
                roughness: 0.05,
                metalness: 0,
                clearcoat: 1,            // lo strato lucido, come l'acetato vero
                clearcoatRoughness: 0.03,
                ior: 1.5,
                depthWrite: false,       // così le parti dietro si vedono attraverso
                side: THREE.DoubleSide
            });
        });
    }

    // "Frontale:1; Stanghette:0 2" → [{ nome: 'Frontale', numeri: [1] }, { nome: 'Stanghette', numeri: [0, 2] }]
    function leggiPartiColore(testo) {
        if (!testo) return [];
        return testo.split(';').map(function(pezzo) {
            const [nome, numeri] = pezzo.split(':');
            return {
                nome: nome.trim(),
                numeri: (numeri || '').trim().split(/\s+/).filter(Boolean).map(Number)
            };
        }).filter(function(p) { return p.nome && p.numeri.length > 0; });
    }

    function carica(dati) {
        if (dati.caricamento) return dati.caricamento;
        dati.caricamento = new Promise(function(fatto, errore) {
            loader.load(dati.voce.dataset.modello, function(gltf) {
                const modello = gltf.scene;

                // data-togli: tolgo le parti da non mostrare (es. il viso), PRIMA di misurare il modello
                const daTogliere = (dati.voce.dataset.togli || '').split(' ').filter(Boolean);
                const togliere = [];
                modello.traverse(function(parte) {
                    if (daTogliere.includes(parte.name)) togliere.push(parte);
                });
                togliere.forEach(function(parte) { parte.removeFromParent(); });

                // data-parti-colore: segno su ogni pezzo a quale parte colorabile appartiene,
                // guardando il numero del suo materiale nel file .glb (prima di cambiare i materiali)
                const partiColore = leggiPartiColore(dati.voce.dataset.partiColore);
                modello.traverse(function(parte) {
                    if (!parte.isMesh) return;
                    const associazione = gltf.parser.associations.get(parte.material);
                    const numero = associazione ? associazione.materials : undefined;
                    const trovata = partiColore.find(function(p) { return p.numeri.includes(numero); });
                    if (trovata) parte.userData.parteColore = trovata.nome;
                });

                // data-montatura / data-lenti: colore e opacità più simili alla realtà
                coloraCristallo(modello, dati.voce.dataset);

                // per ogni parte colorabile: i suoi materiali e il loro colore originale
                // (le copie nella finestra zoom e nella prova usano gli stessi materiali,
                // quindi cambiando il colore qui cambia dappertutto, anche nelle foto)
                dati.parti = partiColore.map(function(p) {
                    const materiali = new Set();
                    modello.traverse(function(parte) {
                        if (parte.isMesh && parte.userData.parteColore === p.nome) materiali.add(parte.material);
                    });
                    materiali.forEach(function(m) { m.userData.coloreOriginale = m.color.clone(); });
                    return { nome: p.nome, materiali: Array.from(materiali), scelta: 'Originale' };
                }).filter(function(p) { return p.materiali.length > 0; });

                // misuro il modello, lo porto al centro e lo ingrandisco/rimpicciolisco
                // così tutti hanno la stessa grandezza, qualunque sia l'unità usata in Blender/Rhino
                const scatola = new THREE.Box3().setFromObject(modello);
                const dimensioni = scatola.getSize(new THREE.Vector3());
                const centro = scatola.getCenter(new THREE.Vector3());
                const fattore = GRANDEZZA / Math.max(dimensioni.x, dimensioni.y, dimensioni.z);
                modello.position.sub(centro).multiplyScalar(fattore);
                modello.scale.multiplyScalar(fattore);

                // un contenitore per le rotazioni: gira intorno al centro (già messo a 0)
                // data-rotazione   = gradi intorno all'asse verticale (se guarda dalla parte sbagliata)
                // data-rotazione-z = gradi intorno all'asse che va verso di noi (se è capovolto)
                const contenitore = new THREE.Group();
                contenitore.add(modello);
                contenitore.rotation.y = THREE.MathUtils.degToRad(Number(dati.voce.dataset.rotazione) || 0);
                contenitore.rotation.z = THREE.MathUtils.degToRad(Number(dati.voce.dataset.rotazioneZ) || 0);

                dati.modello = contenitore;
                dati.perno.add(contenitore);
                fatto(dati);
            }, undefined, function(e) {
                console.error('Non riesco a caricare ' + dati.voce.dataset.modello, e);
                dati.voce.querySelector('.collezione-visore').classList.add('errore');
                errore(e);
            });
        });
        return dati.caricamento;
    }

    // carico e disegno solo le voci vicine allo schermo
    const osservatore = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            const dati = elenco.find(function(d) { return d.voce === entry.target; });
            dati.visibile = entry.isIntersecting;
            if (dati.visibile) carica(dati).catch(function() {});
        });
    }, { rootMargin: '300px' });
    elenco.forEach(function(d) { osservatore.observe(d.voce); });

    // l'angolo in comune: cresce col tempo ed è lo stesso per tutti i modelli
    const orologio = new THREE.Clock();
    let angolo = ANGOLO_INIZIALE;

    function disegna() {
        const dt = orologio.getDelta();
        if (!fermo && !zoom.open) angolo += VELOCITA * dt;   // mentre la finestra è aperta si fermano

        elenco.forEach(function(dati) {
            if (!dati.visibile || !dati.modello) return;

            // il canvas è grande quanto il suo riquadro (in pixel veri dello schermo)
            const larghezza = dati.canvas.clientWidth;
            const altezza = dati.canvas.clientHeight;
            if (larghezza === 0 || altezza === 0) return;
            const pixel = renderer.getPixelRatio();
            if (dati.canvas.width !== Math.round(larghezza * pixel) || dati.canvas.height !== Math.round(altezza * pixel)) {
                dati.canvas.width = Math.round(larghezza * pixel);
                dati.canvas.height = Math.round(altezza * pixel);
            }
            const dimensioneRenderer = renderer.getSize(new THREE.Vector2());
            if (dimensioneRenderer.x !== larghezza || dimensioneRenderer.y !== altezza) {
                renderer.setSize(larghezza, altezza, false);
                camera.aspect = larghezza / altezza;
                camera.updateProjectionMatrix();
            }

            dati.perno.rotation.y = angolo;
            renderer.render(dati.scena, camera);
            dati.ctx.clearRect(0, 0, dati.canvas.width, dati.canvas.height);
            dati.ctx.drawImage(renderer.domElement, 0, 0, dati.canvas.width, dati.canvas.height);
        });

        requestAnimationFrame(disegna);
    }


    // ----- la finestra zoom -----

    const zoom = document.querySelector('.zoom');
    const zoomVisore = zoom.querySelector('.zoom-visore');
    let zoomRenderer = null;     // lo creo la prima volta che si apre la finestra
    let zoomControlli = null;
    const zoomScena = creaScena();
    const zoomPerno = new THREE.Group();
    zoomScena.add(zoomPerno);
    const zoomCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

    function preparaZoom() {
        if (zoomRenderer) return;
        zoomRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        zoomRenderer.setPixelRatio(window.devicePixelRatio);
        zoomVisore.appendChild(zoomRenderer.domElement);
        // la "stanza" va rifatta per questo renderer (ogni renderer ha le sue texture)
        zoomScena.environment = new THREE.PMREMGenerator(zoomRenderer).fromScene(new RoomEnvironment(), 0.04).texture;

        // OrbitControls: trascinare = girare, rotella / due dita = zoom
        zoomControlli = new OrbitControls(zoomCamera, zoomRenderer.domElement);
        zoomControlli.enableDamping = true;   // si ferma piano piano, più morbido
        zoomControlli.enablePan = false;      // il modello resta sempre al centro
        zoomControlli.minDistance = ZOOM_MIN;
        zoomControlli.maxDistance = ZOOM_MAX;

        // gira da solo, finché non lo tocchi tu
        zoomControlli.autoRotateSpeed = 1.5;
        zoomControlli.addEventListener('start', function() {
            zoomControlli.autoRotate = false;
        });
    }

    function ridimensionaZoom() {
        const larghezza = zoomVisore.clientWidth;
        const altezza = zoomVisore.clientHeight;
        if (!zoomRenderer || larghezza === 0 || altezza === 0) return;
        zoomRenderer.setSize(larghezza, altezza);
        zoomCamera.aspect = larghezza / altezza;
        zoomCamera.updateProjectionMatrix();
    }

    function vistaIniziale() {
        zoomCamera.position.copy(POSIZIONE_CAMERA);
        zoomControlli.target.set(0, 0, 0);
        zoomControlli.update();
    }

    // ----- la prova con la fotocamera e la scelta degli occhiali -----

    const prova = creaProva(zoom.querySelector('.prova'));
    const bottoneModo = zoom.querySelector('.zoom-modo');
    let corrente = null;       // gli occhiali mostrati nella finestra
    let modo = '3d';           // '3d' = modello da girare, 'prova' = fotocamera

    // le foto della prova: per l'etichetta sulla foto serve il nome degli occhiali scelti
    const fotografie = creaFoto(zoom, prova, function() {
        return corrente ? corrente.voce.querySelector('.collezione-nome').textContent : '';
    });

    // un bottone per ogni paio di occhiali: il pallino del colore e il nome
    const elencoScelta = zoom.querySelector('.zoom-elenco');
    elenco.forEach(function(dati) {
        const bottone = document.createElement('button');
        bottone.type = 'button';
        bottone.className = 'zoom-voce';
        bottone.appendChild(dati.voce.querySelector('.collezione-pallino').cloneNode(true));
        bottone.append(dati.voce.querySelector('.collezione-nome').textContent);
        bottone.addEventListener('click', function() { scegli(dati); });
        elencoScelta.appendChild(bottone);
        dati.bottoneScelta = bottone;
    });

    // mostra un paio di occhiali nella finestra (sia nel 3D sia nella prova)
    function scegli(dati) {
        corrente = dati;
        zoom.querySelector('.zoom-colore').textContent = dati.voce.querySelector('.collezione-colore').textContent;
        zoom.querySelector('.zoom-nome').textContent = dati.voce.querySelector('.collezione-nome').textContent;

        // la scheda di dettaglio: copio quella nascosta nella voce e aggiungo chi l'ha progettato
        const scheda = zoom.querySelector('.zoom-scheda');
        const origine = dati.voce.querySelector('.collezione-scheda');
        scheda.innerHTML = origine ? origine.innerHTML : '';
        const tipo = dati.voce.querySelector('.collezione-tipo');
        if (tipo) {
            const sovratitolo = document.createElement('p');
            sovratitolo.className = 'scheda-tipo';
            sovratitolo.textContent = tipo.textContent;
            scheda.prepend(sovratitolo);
        }
        const dl = scheda.querySelector('dl');
        if (dl) {
            const anche = dati.voce.querySelector('.collezione-anche');
            const nomi = dati.voce.querySelector('.collezione-nome').textContent +
                (anche ? ', ' + anche.textContent.replace(/^con /, '') : '');
            const dt = document.createElement('dt');
            dt.textContent = 'Progetto';
            const dd = document.createElement('dd');
            dd.textContent = nomi;
            dl.prepend(dt, dd);
        }

        elenco.forEach(function(d) {
            d.bottoneScelta.classList.toggle('selected', d === dati);
        });

        // ci si sposta da soli: la finestra torna su al modello, la camera alla vista iniziale
        // e gli occhiali girano da soli (finché non li tocchi)
        zoom.scrollTo({ top: 0, behavior: fermo ? 'auto' : 'smooth' });
        vistaIniziale();
        zoomControlli.autoRotate = !fermo;

        zoomPerno.clear();
        prova.mostra(null);
        costruisciColori(null);
        carica(dati).then(function() {
            if (!zoom.open || corrente !== dati) return;   // nel frattempo ne è stato scelto un altro
            // una copia del modello (un oggetto 3D può stare in una scena sola), girata come nella row
            zoomPerno.rotation.y = angolo;
            zoomPerno.add(dati.modello.clone());
            prova.mostra(dati.modello);
            costruisciColori(dati);
        }).catch(function() {});
    }

    // ----- i colori delle parti -----

    const pannelloColori = zoom.querySelector('.zoom-colori');
    const valoreColori = pannelloColori.querySelector('.opzione-valore');
    const bottoniParti = pannelloColori.querySelector('.colori-parti');
    const campioniColori = pannelloColori.querySelectorAll('.campione');
    let parteScelta = null;

    // un bottone per ogni parte degli occhiali scelti; si parte dalla prima
    function costruisciColori(dati) {
        bottoniParti.innerHTML = '';
        parteScelta = null;
        const parti = dati && dati.parti ? dati.parti : [];
        pannelloColori.hidden = parti.length === 0;
        parti.forEach(function(parte, i) {
            const bottone = document.createElement('button');
            bottone.type = 'button';
            bottone.className = 'colori-parte';
            bottone.textContent = parte.nome;
            bottone.addEventListener('click', function() { scegliParte(parte, bottone); });
            bottoniParti.appendChild(bottone);
            if (i === 0) scegliParte(parte, bottone);
        });
    }

    function scegliParte(parte, bottone) {
        parteScelta = parte;
        bottoniParti.querySelectorAll('.colori-parte').forEach(function(b) {
            b.classList.toggle('selected', b === bottone);
        });
        aggiornaCampioni();
    }

    // segna il campione della parte scelta e scrive "Parte: colore" nel titolo
    function aggiornaCampioni() {
        campioniColori.forEach(function(c) {
            c.classList.toggle('selected', !!parteScelta && c.dataset.nome === parteScelta.scelta);
        });
        valoreColori.textContent = parteScelta ? parteScelta.nome + ': ' + parteScelta.scelta : '';
    }

    campioniColori.forEach(function(campione) {
        campione.addEventListener('click', function() {
            if (!parteScelta) return;
            parteScelta.materiali.forEach(function(m) { m.color.set(campione.dataset.color); });
            parteScelta.scelta = campione.dataset.nome;
            aggiornaCampioni();
        });
    });

    pannelloColori.querySelector('.colori-originali').addEventListener('click', function() {
        if (!corrente || !corrente.parti) return;
        corrente.parti.forEach(function(parte) {
            parte.materiali.forEach(function(m) { m.color.copy(m.userData.coloreOriginale); });
            parte.scelta = 'Originale';
        });
        aggiornaCampioni();
    });

    // passa dal 3D alla fotocamera e viceversa
    function impostaModo(nuovoModo) {
        modo = nuovoModo;
        const inProva = modo === 'prova';
        zoomVisore.hidden = inProva;
        zoom.querySelector('.prova').hidden = !inProva;
        zoom.querySelectorAll('.solo-3d').forEach(function(el) { el.hidden = inProva; });
        zoom.querySelectorAll('.solo-prova').forEach(function(el) { el.hidden = !inProva; });
        bottoneModo.textContent = inProva ? 'Torna al 3D' : 'Provali con la fotocamera';
        bottoneModo.setAttribute('aria-pressed', inProva ? 'true' : 'false');
        bottoneModo.classList.toggle('selected', inProva);
        fotografie.mostraPannello(inProva);

        if (inProva) {
            zoomRenderer.setAnimationLoop(null);
            prova.avvia();
        } else {
            prova.ferma();
            ridimensionaZoom();
            zoomRenderer.setAnimationLoop(disegnaZoom);
        }
    }

    bottoneModo.addEventListener('click', function() {
        impostaModo(modo === 'prova' ? '3d' : 'prova');
    });

    function apriZoom(dati) {
        preparaZoom();
        zoom.showModal();
        document.body.classList.add('zoom-aperto');   // la pagina sotto non scorre
        impostaModo('3d');
        scegli(dati);
    }

    function disegnaZoom() {
        zoomControlli.update();
        zoomRenderer.render(zoomScena, zoomCamera);
    }

    // avvicina (fattore < 1) o allontana (fattore > 1) la camera, restando nei limiti
    function zooma(fattore) {
        const distanza = THREE.MathUtils.clamp(zoomCamera.position.length() * fattore, ZOOM_MIN, ZOOM_MAX);
        zoomCamera.position.setLength(distanza);
    }

    zoom.querySelector('.zoom-piu').addEventListener('click', function() { zooma(PASSO_ZOOM); });
    zoom.querySelector('.zoom-meno').addEventListener('click', function() { zooma(1 / PASSO_ZOOM); });
    zoom.querySelector('.zoom-riparti').addEventListener('click', vistaIniziale);
    zoom.querySelector('.zoom-chiudi').addEventListener('click', function() { zoom.close(); });

    // un clic fuori dalla finestra (sullo sfondo scuro) la chiude
    zoom.addEventListener('click', function(e) {
        if (e.target === zoom) zoom.close();
    });

    // quando si chiude (bottone, Esc o clic fuori) smetto di disegnare
    zoom.addEventListener('close', function() {
        zoomRenderer.setAnimationLoop(null);
        prova.ferma();   // spegne la fotocamera
        zoomPerno.clear();
        document.body.classList.remove('zoom-aperto');
    });

    window.addEventListener('resize', function() {
        if (zoom.open) ridimensionaZoom();
    });

    requestAnimationFrame(disegna);
}
