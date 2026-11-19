// prova.js – "Provali con la fotocamera": gli occhiali 3D sopra il tuo viso, dal vivo
// (lo usa collezione.js, nella finestra zoom)
//
// Come funziona:
// 1. la fotocamera manda il video in un <video>
// 2. MediaPipe Face Landmarker (una libreria di Google che gira nel browser) trova
//    478 punti sul viso in ogni fotogramma: occhi, tempie, fronte, mento...
// 3. da quei punti calcolo dove mettere gli occhiali (in mezzo agli occhi),
//    quanto farli grandi (larghi come il viso tra le tempie) e come girarli (come la testa)
// 4. Three.js disegna gli occhiali in un canvas trasparente sopra il video
//
// Il video resta sul tuo dispositivo: il riconoscimento del viso avviene nel browser.
// Attenzione: il browser dà la fotocamera solo a pagine https o aperte da localhost.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const VERSIONE_MEDIAPIPE = '0.10.14';
const URL_VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VERSIONE_MEDIAPIPE + '/vision_bundle.mjs';
const URL_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VERSIONE_MEDIAPIPE + '/wasm';
const URL_MODELLO_VISO = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// i numeri dei punti del viso che mi servono (dalla mappa dei punti di MediaPipe)
const OCCHIO_DX_ESTERNO = 33;
const OCCHIO_DX_INTERNO = 133;
const OCCHIO_SX_INTERNO = 362;
const OCCHIO_SX_ESTERNO = 263;
const TEMPIA_DX = 127;
const TEMPIA_SX = 356;
const FRONTE = 10;
const MENTO = 152;

const LARGHEZZA_SU_VISO = 1.02;   // occhiali larghi quanto il viso tra le tempie (1 = uguale)
const ALTEZZA_SU_OCCHI = 0;       // spostamento in su (+) o in giù (-), in larghezze di occhiali
const MORBIDEZZA = 0.5;           // 1 = segue il viso di scatto, più basso = più morbido (meno tremolio)


export function creaProva(contenitore) {
    const scena = contenitore.querySelector('.prova-scena');
    const video = contenitore.querySelector('video');
    const messaggio = contenitore.querySelector('.prova-messaggio');

    let renderer = null;
    let riconoscitore = null;   // il Face Landmarker, caricato la prima volta
    let flusso = null;          // il video della fotocamera
    let attiva = false;
    let ultimoTempoVideo = -1;

    // la scena 3D: la camera "ortografica" è grande quanto il video in pixel,
    // così un punto del viso (in pixel) e un punto 3D coincidono
    const scena3d = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, 640, 0, -480, 1, 20000);
    camera.position.z = 10000;
    scena3d.add(new THREE.AmbientLight(0xffffff, 0.6));
    const luce = new THREE.DirectionalLight(0xffffff, 1.5);
    luce.position.set(0, 1, 2);   // la luce arriva da davanti e un po' dall'alto, come lo schermo
    scena3d.add(luce);

    // "occhiali" si muove con il viso; dentro: il modello e una testa invisibile.
    // Misure dentro "occhiali": larghezza degli occhiali = 1, il davanti della montatura a z = 0
    const occhiali = new THREE.Group();
    occhiali.visible = false;
    scena3d.add(occhiali);
    const supporto = new THREE.Group();
    occhiali.add(supporto);

    // la testa invisibile: non si vede ma nasconde le stanghette che vanno dietro al viso
    // (colorWrite: false = non colora niente, ma "occupa" lo spazio)
    const testa = new THREE.Mesh(
        new THREE.SphereGeometry(1, 32, 24),
        new THREE.MeshBasicMaterial({ colorWrite: false })
    );
    testa.scale.set(0.45, 0.62, 0.6);
    testa.position.set(0, 0.05, -0.62);
    testa.renderOrder = -1;   // la disegno per prima
    occhiali.add(testa);

    function scriviMessaggio(testo) {
        messaggio.textContent = testo;
        messaggio.hidden = testo === '';
    }

    function preparaRenderer() {
        if (renderer) return;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        scena.appendChild(renderer.domElement);
        scena3d.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    }

    async function caricaRiconoscitore() {
        if (riconoscitore) return;
        // la libreria si carica solo ora, quando serve (è grande)
        const { FaceLandmarker, FilesetResolver } = await import(URL_VISION);
        const fileset = await FilesetResolver.forVisionTasks(URL_WASM);
        riconoscitore = await FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: URL_MODELLO_VISO, delegate: 'GPU' },
            runningMode: 'VIDEO',
            numFaces: 1
        });
    }

    // il riquadro prende le proporzioni del video e sta nello spazio disponibile
    function adatta() {
        if (!renderer || !attiva) return;
        const larghezzaVideo = video.videoWidth || 640;
        const altezzaVideo = video.videoHeight || 480;
        const larghezzaMax = contenitore.clientWidth;
        const altezzaMax = Math.min(window.innerHeight * 0.6, 560);
        let larghezza = larghezzaMax;
        let altezza = larghezza * altezzaVideo / larghezzaVideo;
        if (altezza > altezzaMax) {
            altezza = altezzaMax;
            larghezza = altezza * larghezzaVideo / altezzaVideo;
        }
        scena.style.width = larghezza + 'px';
        scena.style.height = altezza + 'px';
        renderer.setSize(larghezza, altezza);
        camera.right = larghezzaVideo;
        camera.bottom = -altezzaVideo;
        camera.updateProjectionMatrix();
    }

    async function avvia() {
        attiva = true;
        preparaRenderer();
        scriviMessaggio('Accendo la fotocamera…');
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('fotocamera non disponibile');
            }
            const nuovoFlusso = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
            if (!attiva) {   // la finestra è stata chiusa mentre aspettavo il permesso
                nuovoFlusso.getTracks().forEach(function(t) { t.stop(); });
                return;
            }
            flusso = nuovoFlusso;
            video.srcObject = flusso;
            await video.play();
            adatta();

            scriviMessaggio('Carico il riconoscimento del viso…');
            await caricaRiconoscitore();
            if (!attiva) return;

            scriviMessaggio('');
            renderer.setAnimationLoop(fotogramma);
        } catch (errore) {
            console.error(errore);
            if (errore.name === 'NotAllowedError') {
                scriviMessaggio('Per provare gli occhiali serve il permesso di usare la fotocamera.');
            } else if (errore.name === 'NotFoundError') {
                scriviMessaggio('Non trovo nessuna fotocamera su questo dispositivo.');
            } else {
                scriviMessaggio('Non riesco ad avviare la prova. La pagina deve essere aperta in https o da localhost.');
            }
        }
    }

    function ferma() {
        attiva = false;
        if (renderer) renderer.setAnimationLoop(null);
        if (flusso) {
            flusso.getTracks().forEach(function(t) { t.stop(); });   // spegne la lucina della fotocamera
            flusso = null;
        }
        video.srcObject = null;
        occhiali.visible = false;
    }

    // mette gli occhiali scelti; "modello" è il modello già centrato della collezione
    function mostra(modello) {
        supporto.clear();
        if (!modello) return;

        // lo porto a misura: larghezza 1 e il davanti della montatura a z = 0
        const copia = modello.clone();
        const scatola = new THREE.Box3().setFromObject(copia);
        const dimensioni = scatola.getSize(new THREE.Vector3());
        const centro = scatola.getCenter(new THREE.Vector3());
        const fattore = 1 / dimensioni.x;
        const pezzo = new THREE.Group();
        pezzo.add(copia);
        pezzo.scale.setScalar(fattore);
        pezzo.position.set(-centro.x * fattore, -centro.y * fattore + ALTEZZA_SU_OCCHI, -scatola.max.z * fattore);
        supporto.add(pezzo);
    }

    // ogni fotogramma: cerco il viso e sposto gli occhiali
    function fotogramma() {
        if (video.readyState >= 2 && video.currentTime !== ultimoTempoVideo) {
            ultimoTempoVideo = video.currentTime;
            const risultato = riconoscitore.detectForVideo(video, performance.now());
            posiziona(risultato.faceLandmarks && risultato.faceLandmarks[0]);
        }
        renderer.render(scena3d, camera);
    }

    const posizioneObiettivo = new THREE.Vector3();
    const rotazioneObiettivo = new THREE.Quaternion();
    const matrice = new THREE.Matrix4();

    function posiziona(punti) {
        if (!punti) {   // nessun viso: nascondo gli occhiali
            occhiali.visible = false;
            return;
        }
        const w = video.videoWidth;
        const h = video.videoHeight;
        // un punto del viso in pixel: x verso destra, y verso l'alto, z verso di me
        function punto(i) {
            return new THREE.Vector3(punti[i].x * w, -punti[i].y * h, -punti[i].z * w);
        }

        // gli assi della testa: "destra" da un occhio all'altro, "su" dal mento alla fronte
        const destra = punto(OCCHIO_SX_ESTERNO).sub(punto(OCCHIO_DX_ESTERNO)).normalize();
        const su = punto(FRONTE).sub(punto(MENTO));
        su.sub(destra.clone().multiplyScalar(su.dot(destra))).normalize();
        const avanti = new THREE.Vector3().crossVectors(destra, su);
        rotazioneObiettivo.setFromRotationMatrix(matrice.makeBasis(destra, su, avanti));

        // il centro: in mezzo ai quattro angoli degli occhi
        posizioneObiettivo.copy(punto(OCCHIO_DX_ESTERNO))
            .add(punto(OCCHIO_DX_INTERNO))
            .add(punto(OCCHIO_SX_INTERNO))
            .add(punto(OCCHIO_SX_ESTERNO))
            .multiplyScalar(0.25);
        posizioneObiettivo.z = 0;

        const larghezza = punto(TEMPIA_DX).distanceTo(punto(TEMPIA_SX)) * LARGHEZZA_SU_VISO;

        if (!occhiali.visible) {   // il viso è appena comparso: vado subito al posto giusto
            occhiali.position.copy(posizioneObiettivo);
            occhiali.quaternion.copy(rotazioneObiettivo);
            occhiali.scale.setScalar(larghezza);
            occhiali.visible = true;
        } else {                   // altrimenti mi avvicino un po' alla volta (meno tremolio)
            occhiali.position.lerp(posizioneObiettivo, MORBIDEZZA);
            occhiali.quaternion.slerp(rotazioneObiettivo, MORBIDEZZA);
            occhiali.scale.setScalar(THREE.MathUtils.lerp(occhiali.scale.x, larghezza, MORBIDEZZA));
        }
    }

    // scatta una foto: video + occhiali in un'unica immagine JPEG, specchiata come la vedi.
    // etichetta = il testo da scrivere in basso a sinistra (es. "Occhiali di ...").
    // Restituisce una "promessa" con l'immagine (Blob), o null se la fotocamera non è pronta.
    function scatta(etichetta) {
        if (!attiva || !renderer || !riconoscitore || video.readyState < 2) return null;
        const w = video.videoWidth;
        const h = video.videoHeight;
        const tela = document.createElement('canvas');
        tela.width = w;
        tela.height = h;
        const ctx = tela.getContext('2d');

        // ridisegno gli occhiali proprio adesso: così l'immagine del canvas 3D è pronta da copiare
        renderer.render(scena3d, camera);

        // specchio tutto, come sullo schermo
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.drawImage(renderer.domElement, 0, 0, w, h);
        ctx.restore();

        // l'etichetta: un rettangolo scuro con il testo bianco (non specchiato)
        if (etichetta) {
            const grandezza = Math.max(16, Math.round(w * 0.026));
            const margine = Math.round(grandezza * 0.9);
            const righe = [etichetta, 'Triennale Milano · In mostra'];
            ctx.font = 'bold ' + grandezza + 'px Roboto, Helvetica, sans-serif';
            const larghezzaTesto = Math.max.apply(null, righe.map(function(r) { return ctx.measureText(r).width; }));
            const altezzaRiquadro = grandezza * 2 + margine * 1.4;
            ctx.fillStyle = 'rgba(34, 34, 34, 0.7)';
            ctx.fillRect(margine, h - margine - altezzaRiquadro, larghezzaTesto + margine * 1.4, altezzaRiquadro);
            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'top';
            ctx.fillText(righe[0], margine * 1.7, h - margine - altezzaRiquadro + margine * 0.5);
            ctx.font = grandezza * 0.8 + 'px Roboto, Helvetica, sans-serif';
            ctx.fillText(righe[1], margine * 1.7, h - margine - altezzaRiquadro + margine * 0.5 + grandezza * 1.15);
        }

        return new Promise(function(fatto) {
            tela.toBlob(fatto, 'image/jpeg', 0.92);
        });
    }

    window.addEventListener('resize', adatta);

    return { avvia, ferma, mostra, adatta, scatta };
}
