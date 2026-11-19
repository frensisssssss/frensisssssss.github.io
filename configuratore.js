// configuratore.js – i visualizzatori 3D della sezione "In mostra"
// (viene caricato come modulo dall'<head> di index.html)
//
// Nella pagina ci sono più configuratori (la lampada PH5, gli occhiali...).
// Ognuno è un elemento con la classe "configuratore" che contiene un .visore e un .pannello.
// La funzione creaConfiguratore() qui sotto fa funzionare UN configuratore:
// la chiamo una volta per ognuno, e ognuno ha la sua scena, la sua camera e i suoi bottoni.
//
// Le cose che cambiano da un modello all'altro si scrivono nell'HTML, sull'elemento .configuratore:
//   data-modello   = il file .glb da caricare
//   data-escludi   = parti da non contare quando misuro il modello (es. il cavo, lunghissimo)
//   data-collegate = parti che nell'animazione si muovono con un'altra (es. "cavo:attacco")
//   data-luce      = la parte su cui mettere la lampadina (solo per la lampada)

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';


// ===== cose in comune a tutti i configuratori =====

// quando si sceglie un bottone: lui diventa "selected", gli altri del gruppo no,
// e il nome scelto (data-nome) si scrive nello span .opzione-valore del suo gruppo
function seleziona(bottone, gruppo) {
    gruppo.forEach(function(b) {
        b.classList.remove('selected');
    });
    bottone.classList.add('selected');

    const valore = bottone.closest('.opzione').querySelector('.opzione-valore');
    valore.textContent = bottone.dataset.nome;
}

// crea il materiale di un gruppo di colore
// - normale: laccato e lucido (MeshPhysicalMaterial con clearcoat = vernice trasparente sopra il colore)
// - trasparente: come vetro colorato (per le lenti degli occhiali)
function creaMateriale(colore, trasparente) {
    if (trasparente) {
        return new THREE.MeshPhysicalMaterial({
            color: colore,
            roughness: 0.05,
            metalness: 0,
            transmission: 0.9,     // quanta luce passa attraverso (1 = tutta)
            thickness: 0.3,        // lo spessore "finto" che piega la luce
            ior: 1.5,              // come si piega la luce (1.5 = vetro/plastica)
            side: THREE.DoubleSide
        });
    }
    return new THREE.MeshPhysicalMaterial({
        color: colore,
        roughness: 0.25,           // 0 = specchio, 1 = opaco
        metalness: 0,              // non è metallo, è una superficie verniciata
        clearcoat: 1,              // lo strato lucido sopra il colore
        clearcoatRoughness: 0.05,  // quanto è liscio quello strato
        side: THREE.DoubleSide     // le parti sono sottili: si colorano sia sopra sia sotto
    });
}

const GRANDEZZA_VISORE = 2.2;      // quanto deve essere grande il modello nella scena
const COLORE_LAMPADINA = 0xffd59a; // luce calda, giallo-arancio
const DURATA_ANIMAZIONE = 5;       // secondi
const SEPARAZIONE = 1.5;           // quanto si allontanano le parti nell'animazione


// ===== un configuratore =====

function creaConfiguratore(sezione) {
    // le impostazioni scritte nell'HTML
    const fileModello = sezione.dataset.modello;
    const partiEscluse = sezione.dataset.escludi ? sezione.dataset.escludi.split(' ') : [];
    const nomeParteLuce = sezione.dataset.luce || null;
    const nomeGruppoStanghette = sezione.dataset.stanghette || null;
    const collegate = {};   // es. { cavo: 'attacco' }
    if (sezione.dataset.collegate) {
        sezione.dataset.collegate.split(' ').forEach(function(coppia) {
            const [parte, aChi] = coppia.split(':');
            collegate[parte] = aChi;
        });
    }

    // il contenitore in cui disegnare
    const visore = sezione.querySelector('.visore');

    // la scena: il "mondo" che contiene tutti gli oggetti
    const scena = new THREE.Scene();

    // la camera: il nostro punto di vista (angolo, proporzioni, distanza minima e massima)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(3, 2, 4);
    camera.lookAt(0, 0, 0);

    // il renderer disegna la scena in un <canvas>; alpha: true = sfondo trasparente,
    // così si vede il beige del visore
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);

    // tolgo la scritta segnaposto e metto il canvas al suo posto
    visore.querySelector('.visore-segnaposto').remove();
    visore.appendChild(renderer.domElement);

    // una superficie lucida ha bisogno di qualcosa da riflettere: RoomEnvironment è una
    // "stanza" virtuale con pannelli luminosi, che si specchia sull'oggetto
    const pmrem = new THREE.PMREMGenerator(renderer);
    scena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // le luci: una diffusa ovunque e una che arriva da una direzione
    const luceAmbiente = new THREE.AmbientLight(0xffffff, 0.4);
    scena.add(luceAmbiente);
    const luce = new THREE.DirectionalLight(0xffffff, 1.5);
    luce.position.set(3, 5, 4);
    scena.add(luce);


    // ----- i gruppi di colore -----

    // ogni gruppo del pannello ha il suo materiale, che vale per le parti scritte nel suo
    // data-parti; data-materiale="trasparente" lo rende come vetro colorato
    const gruppiColore = sezione.querySelectorAll('.opzione[data-parti]');
    const materialePerParte = {};   // es. { paralume_grande: materiale1, attacco: materiale1, ... }

    gruppiColore.forEach(function(gruppo) {
        const coloreIniziale = gruppo.querySelector('.campione.selected').dataset.color;
        const materiale = creaMateriale(coloreIniziale, gruppo.dataset.materiale === 'trasparente');

        gruppo.dataset.parti.split(' ').forEach(function(nomeParte) {
            materialePerParte[nomeParte] = materiale;
        });

        // i campioni di questo gruppo cambiano solo il materiale di questo gruppo
        const campioni = gruppo.querySelectorAll('.campione');
        campioni.forEach(function(campione) {
            campione.addEventListener('click', function() {
                seleziona(campione, campioni);
                materiale.color.set(campione.dataset.color);
                // un colore scelto a mano: nessun accostamento è più quello attivo
                togliAccostamento();
            });
        });
    });

    // trova il materiale di una parte: guardo il suo nome e, se non c'è, quello dei
    // "genitori" (negli occhiali i pezzi sono dentro due gruppi chiamati "aste" e "lente")
    function materialeDi(parte) {
        let oggetto = parte;
        while (oggetto) {
            if (materialePerParte[oggetto.name]) return materialePerParte[oggetto.name];
            oggetto = oggetto.parent;
        }
        return null;
    }


    // ----- gli accostamenti -----

    const accostamenti = sezione.querySelectorAll('.accostamento');
    const bloccoAccostamenti = sezione.querySelector('.accostamenti');
    const valoreAccostamento = bloccoAccostamenti
        ? bloccoAccostamenti.closest('.opzione').querySelector('.opzione-valore')
        : null;

    accostamenti.forEach(function(accostamento) {
        // sotto il nome del bottone mostro i colori dell'accostamento come piccoli pallini,
        // creati leggendo data-colori (così i colori si scrivono una volta sola, nell'HTML)
        const fila = document.createElement('span');
        fila.className = 'accostamento-colori';
        const nomiColori = accostamento.dataset.nomi.split(',');
        accostamento.dataset.colori.split(' ').forEach(function(colore, i) {
            const pallino = document.createElement('span');
            pallino.className = 'accostamento-pallino';
            pallino.style.background = colore;
            pallino.title = nomiColori[i];   // passandoci sopra col mouse compare il nome
            fila.appendChild(pallino);
        });
        accostamento.appendChild(fila);

        accostamento.addEventListener('click', function() {
            // data-colori e data-nomi hanno un valore per gruppo, nello stesso ordine dei gruppi
            const colori = accostamento.dataset.colori.split(' ');
            const nomi = accostamento.dataset.nomi.split(',');

            gruppiColore.forEach(function(gruppo, i) {
                // il materiale di questo gruppo prende il colore dell'accostamento
                const primaParte = gruppo.dataset.parti.split(' ')[0];
                materialePerParte[primaParte].color.set(colori[i]);

                // sono colori fuori dai 5 campioni: nessun cerchio resta scelto,
                // e accanto al titolo scrivo il nome del colore dell'accostamento
                gruppo.querySelectorAll('.campione').forEach(function(c) {
                    c.classList.remove('selected');
                });
                gruppo.querySelector('.opzione-valore').textContent = nomi[i];
            });

            seleziona(accostamento, accostamenti);
        });
    });

    function togliAccostamento() {
        if (!valoreAccostamento) return;
        accostamenti.forEach(function(a) {
            a.classList.remove('selected');
        });
        valoreAccostamento.textContent = 'Personalizzato';
    }


    // ----- il modello 3D -----

    // il modello va dentro un contenitore: il contenitore serve per Misura e Grandezza,
    // così quando cambio la scala non tocco le regolazioni fatte al modello
    const contenitore = new THREE.Group();
    scena.add(contenitore);

    let dimensioniModello = null;   // le misure del modello nella scena (si sanno dopo il caricamento)

    // la lampadina (usata solo se il modello ha una parte data-luce): parte spenta
    const luceLampada = new THREE.PointLight(COLORE_LAMPADINA, 0);
    let materialeLuminoso = null;   // la parte che si illumina (il diffusore della lampada)

    // le parti che si muovono nell'animazione (si riempie quando il modello è caricato)
    const partiAnimate = [];

    const loader = new GLTFLoader();
    loader.load(fileModello, function(gltf) {
        const modello = gltf.scene;

        modello.traverse(function(parte) {
            if (!parte.isMesh) return;

            // ogni parte che compare in un gruppo di colore prende il materiale di quel gruppo;
            // le altre tengono il loro
            const materiale = materialeDi(parte);
            if (materiale) {
                parte.material = materiale;
            }

            // la parte della luce: le do un colore "emissivo", cioè che brilla di luce propria
            // (parte da 0 = spento), e ci metto sopra la lampadina
            if (parte.name === nomeParteLuce) {
                parte.material = parte.material.clone();
                parte.material.emissive = new THREE.Color(COLORE_LAMPADINA);
                parte.material.emissiveIntensity = 0;
                materialeLuminoso = parte.material;

                parte.geometry.computeBoundingBox();
                parte.geometry.boundingBox.getCenter(luceLampada.position);
                luceLampada.position.y += 0.03;
                parte.add(luceLampada);   // così segue il modello quando cambia grandezza
            }
        });

        // misuro il modello (senza le parti escluse) e lo ingrandisco perché stia bene nel visore
        const scatola = new THREE.Box3();
        modello.traverse(function(parte) {
            if (parte.isMesh && !partiEscluse.includes(parte.name)) {
                scatola.expandByObject(parte);
            }
        });
        const dimensioni = scatola.getSize(new THREE.Vector3());
        const centro = scatola.getCenter(new THREE.Vector3());
        const fattore = GRANDEZZA_VISORE / Math.max(dimensioni.x, dimensioni.y, dimensioni.z);

        // per l'animazione: di ogni parte mi segno la posizione di partenza e in che direzione
        // (e quanto) sta rispetto al centro del modello: si allontanerà in quella direzione
        const perNome = {};
        modello.updateMatrixWorld(true);
        modello.traverse(function(parte) {
            if (!parte.isMesh) return;
            const centroParte = new THREE.Box3().setFromObject(parte).getCenter(new THREE.Vector3());
            const voce = {
                parte: parte,
                inizio: parte.position.clone(),
                distanza: centroParte.sub(centro)
            };
            if (parte.name) perNome[parte.name] = voce;
            partiAnimate.push(voce);
        });
        // le parti collegate si muovono come quella a cui sono attaccate (es. il cavo con l'attacco)
        partiAnimate.forEach(function(voce) {
            const aChi = collegate[voce.parte.name];
            if (aChi && perNome[aChi]) voce.distanza = perNome[aChi].distanza.clone();
        });

        // le stanghette (solo se nell'HTML c'è data-stanghette)
        if (nomeGruppoStanghette) {
            preparaStanghette(modello.getObjectByName(nomeGruppoStanghette), dimensioni);
        }

        // ingrandisco e sposto il modello in modo che il suo centro sia al centro della scena
        modello.scale.setScalar(fattore);
        modello.position.set(-centro.x * fattore, -centro.y * fattore, -centro.z * fattore);
        contenitore.add(modello);

        // mi segno le misure del modello già ingrandito: servono per le viste
        dimensioniModello = dimensioni.clone().multiplyScalar(fattore);

        // si parte dalla vista prospettica, alla distanza giusta per queste misure
        camera.position.copy(posizioneVista('prospettica'));

        // il modello è pronto: preparo gli screen della galleria
        programmaScreen();
    }, undefined, function(errore) {
        console.error('Non riesco a caricare ' + fileModello, errore);
    });


    // adatta il canvas alla grandezza del visore (anche quando la finestra cambia)
    new ResizeObserver(function(voci) {
        const { width, height } = voci[0].contentRect;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }).observe(visore);

    // i controlli: trascinando col mouse (o col dito) la camera gira intorno al modello,
    // con la rotella ci si avvicina o allontana
    const controlli = new OrbitControls(camera, renderer.domElement);
    controlli.enableDamping = true;   // il movimento rallenta dolcemente invece di fermarsi di colpo
    controlli.enablePan = false;      // niente spostamento laterale: il modello resta al centro
    controlli.minDistance = 1.5;      // quanto ci si può avvicinare
    controlli.maxDistance = 15;       // quanto ci si può allontanare
    controlli.autoRotateSpeed = 1.5;  // velocità della rotazione automatica (vista Esplora)


    // ----- le 12 luci colorate che si accendono quando ruoti il modello -----

    const anelloLuci = new THREE.Group();
    scena.add(anelloLuci);

    const NUMERO_LUCI = 12;
    const RAGGIO = 2.4;           // distanza delle luci dal centro
    const INTENSITA_MAX = 4;      // quanto sono forti le luci quando sono accese
    const luci = [];

    for (let i = 0; i < NUMERO_LUCI; i++) {
        // ogni luce ha un colore diverso: giro tutta la ruota dei colori in 12 passi
        const colore = new THREE.Color().setHSL(i / NUMERO_LUCI, 0.8, 0.6);

        // 12 punti distribuiti in cerchio, alternati un po' in alto e un po' in basso
        const angolo = (i / NUMERO_LUCI) * Math.PI * 2;
        const luceColorata = new THREE.PointLight(colore, 0);   // parte spenta
        luceColorata.position.set(Math.cos(angolo) * RAGGIO, (i % 2 === 0) ? 0.6 : -0.6, Math.sin(angolo) * RAGGIO);
        anelloLuci.add(luceColorata);
        luci.push(luceColorata);
    }

    let luciAccese = 0;              // 0 = spente, 1 = accese (cambia piano piano)
    let obiettivo = 0;               // dove deve arrivare luciAccese
    let destinazioneCamera = null;   // dove sta andando la camera quando scegli una vista
    let esplora = false;             // true quando è scelta la vista Esplora
    let lampadaAccesa = 0;           // 0 = spenta, 1 = accesa
    let obiettivoLampada = 0;
    let inizioAnimazione = null;     // il momento in cui è partita l'animazione (null = ferma)

    controlli.addEventListener('start', function() {
        obiettivo = 1;
        destinazioneCamera = null;   // se trascini, il viaggio verso una vista si interrompe
        controlli.autoRotate = esplora;
    });
    controlli.addEventListener('end', function() { obiettivo = 0; });


    // ----- l'animazione: a ogni fotogramma aggiorno tutto e ridisegno la scena -----

    renderer.setAnimationLoop(function() {
        // se è stata scelta una vista, la camera ci arriva piano piano
        if (destinazioneCamera) {
            camera.position.lerp(destinazioneCamera, 0.08);
            if (camera.position.distanceTo(destinazioneCamera) < 0.01) {
                destinazioneCamera = null;   // arrivata
                controlli.autoRotate = esplora;
            }
        }

        controlli.update();

        // le 12 luci si accendono e si spengono in dissolvenza, e girano mentre sono accese
        luciAccese += (obiettivo - luciAccese) * 0.08;
        luci.forEach(function(l) {
            l.intensity = luciAccese * INTENSITA_MAX;
        });
        anelloLuci.rotation.y += 0.01 * luciAccese;

        // l'animazione delle parti, se è in corso
        if (inizioAnimazione !== null) {
            animaModello();
        }

        // le stanghette (se ci sono)
        muoviStanghette();

        // la lampada si accende e si spegne in dissolvenza: la lampadina e il diffusore
        // si illuminano, mentre le luci della "stanza" si abbassano, come la sera
        lampadaAccesa += (obiettivoLampada - lampadaAccesa) * 0.06;
        luceLampada.intensity = lampadaAccesa * 6;
        if (materialeLuminoso) {
            materialeLuminoso.emissiveIntensity = lampadaAccesa * 3;
        }
        luceAmbiente.intensity = 0.4 - 0.3 * lampadaAccesa;
        luce.intensity = 1.5 - 1.2 * lampadaAccesa;
        scena.environmentIntensity = 1 - 0.7 * lampadaAccesa;

        renderer.render(scena, camera);

        // se c'è da aggiornare la galleria (e niente si sta muovendo), scatto gli screen
        if (screenDaFare && inizioAnimazione === null && dimensioniModello) {
            screenDaFare = false;
            scattaScreen();
        }
    });


    // ----- l'interruttore (c'è solo se nell'HTML c'è il bottone) -----

    const interruttore = sezione.querySelector('.interruttore');
    if (interruttore) {
        const statoLuce = interruttore.closest('.opzione').querySelector('.opzione-valore');

        interruttore.addEventListener('click', function() {
            const accendo = (obiettivoLampada === 0);
            obiettivoLampada = accendo ? 1 : 0;

            // aggiorno il bottone, la scritta accanto a "Luce" e lo sfondo del visore
            interruttore.textContent = accendo ? 'Spegni' : 'Accendi';
            interruttore.classList.toggle('selected', accendo);
            interruttore.setAttribute('aria-pressed', accendo);
            statoLuce.textContent = accendo ? 'Accesa' : 'Spenta';
            visore.classList.toggle('accesa', accendo);
        });
    }


    // ----- l'animazione: il modello si scompone mentre fa un giro su sé stesso -----

    const bottoneAnima = sezione.querySelector('.anima');
    if (bottoneAnima) {
        bottoneAnima.addEventListener('click', function() {
            if (inizioAnimazione !== null || partiAnimate.length === 0) return;   // già in corso o non caricato
            inizioAnimazione = performance.now();
            bottoneAnima.classList.add('selected');
            bottoneAnima.textContent = 'In corso…';
        });
    }

    // viene chiamata a ogni fotogramma finché l'animazione è in corso
    function animaModello() {
        // a che punto siamo: 0 = inizio, 1 = fine
        const secondi = (performance.now() - inizioAnimazione) / 1000;
        const avanzamento = Math.min(secondi / DURATA_ANIMAZIONE, 1);

        // le parti si aprono e si richiudono: il seno² va dolcemente da 0 a 1 (a metà) e torna a 0
        const apertura = Math.sin(Math.PI * avanzamento) ** 2;
        partiAnimate.forEach(function(voce) {
            voce.parte.position.copy(voce.inizio).addScaledVector(voce.distanza, SEPARAZIONE * apertura);
        });

        // intanto il modello fa un giro completo, partendo e fermandosi piano
        const giro = (1 - Math.cos(Math.PI * avanzamento)) / 2;
        contenitore.rotation.y = giro * Math.PI * 2;

        // finita: tutto torna com'era e il bottone si riattiva
        if (avanzamento === 1) {
            inizioAnimazione = null;
            contenitore.rotation.y = 0;
            bottoneAnima.classList.remove('selected');
            bottoneAnima.textContent = 'Avvia';
        }
    }


    // ----- le stanghette degli occhiali: si aprono e si chiudono -----

    const ANGOLO_CHIUSURA = THREE.MathUtils.degToRad(85);   // quanto ruotano per chiudersi
    const cerniere = [];        // per ogni stanghetta: { perno, angoloChiuso }
    let stanghetteAperte = 1;   // 1 = aperte, 0 = chiuse (cambia piano piano)
    let obiettivoStanghette = 1;

    // il modello non dice quali pezzi sono le stanghette, quindi le riconosco dalla forma:
    // sono i pezzi lunghi in profondità (vanno dal frontale verso le orecchie)
    function preparaStanghette(gruppo, dimensioniTotali) {
        if (!gruppo) return;

        const pezzi = [];
        gruppo.traverse(function(parte) {
            if (parte.isMesh) pezzi.push({ parte: parte, scatola: new THREE.Box3().setFromObject(parte) });
        });

        const stanghe = [];
        const frontale = new THREE.Box3();
        pezzi.forEach(function(p) {
            const profondita = p.scatola.max.z - p.scatola.min.z;
            if (profondita > dimensioniTotali.z * 0.4) stanghe.push(p);
            else frontale.union(p.scatola);
        });
        if (stanghe.length === 0 || frontale.isEmpty()) {
            console.warn('Non trovo le stanghette nel gruppo ' + gruppo.name);
            return;
        }
        const zFrontale = frontale.getCenter(new THREE.Vector3()).z;
        const xCentro = frontale.getCenter(new THREE.Vector3()).x;

        // divido i pezzi in stanghetta sinistra e destra
        [-1, 1].forEach(function(lato) {
            const mieiPezzi = stanghe.filter(function(p) {
                return Math.sign(p.scatola.getCenter(new THREE.Vector3()).x - xCentro) === lato;
            });
            if (mieiPezzi.length === 0) return;

            const scatola = new THREE.Box3();
            mieiPezzi.forEach(function(p) { scatola.union(p.scatola); });
            const centroStanghetta = scatola.getCenter(new THREE.Vector3());

            // la cerniera è l'estremità della stanghetta più vicina al frontale
            const zCerniera = Math.abs(scatola.min.z - zFrontale) < Math.abs(scatola.max.z - zFrontale)
                ? scatola.min.z : scatola.max.z;
            const verso = Math.sign(centroStanghetta.z - zCerniera);   // da che parte va la stanghetta

            // il perno: un oggetto invisibile messo sulla cerniera; ci "appendo" i pezzi
            // della stanghetta (attach mantiene la loro posizione), così ruotando il perno
            // la stanghetta gira intorno alla cerniera
            const perno = new THREE.Object3D();
            perno.position.set(centroStanghetta.x, centroStanghetta.y, zCerniera);
            gruppo.add(perno);
            gruppo.updateMatrixWorld(true);
            mieiPezzi.forEach(function(p) {
                perno.attach(p.parte);
                // la posizione del pezzo ora è relativa al perno: aggiorno quella per l'animazione
                partiAnimate.forEach(function(voce) {
                    if (voce.parte === p.parte) voce.inizio.copy(p.parte.position);
                });
            });

            // per chiudersi verso l'interno: destra e sinistra girano in versi opposti
            cerniere.push({ perno: perno, angoloChiuso: -lato * verso * ANGOLO_CHIUSURA });
        });
    }

    const bottoneStanghette = sezione.querySelector('.stanghette');
    if (bottoneStanghette) {
        const statoStanghette = bottoneStanghette.closest('.opzione').querySelector('.opzione-valore');

        bottoneStanghette.addEventListener('click', function() {
            const chiudo = (obiettivoStanghette === 1);
            obiettivoStanghette = chiudo ? 0 : 1;

            bottoneStanghette.textContent = chiudo ? 'Apri' : 'Chiudi';
            bottoneStanghette.classList.toggle('selected', chiudo);
            bottoneStanghette.setAttribute('aria-pressed', chiudo);
            statoStanghette.textContent = chiudo ? 'Chiuse' : 'Aperte';
        });
    }

    // a ogni fotogramma: le stanghette ruotano piano verso aperte o chiuse
    function muoviStanghette() {
        stanghetteAperte += (obiettivoStanghette - stanghetteAperte) * 0.08;
        cerniere.forEach(function(c) {
            c.perno.rotation.y = (1 - stanghetteAperte) * c.angoloChiuso;
        });
    }


    // ----- la galleria: 3 screen del modello, uno per vista -----

    // ogni <img class="galleria-img"> ha in data-vista quale vista mostrare
    const immaginiGalleria = sezione.querySelectorAll('.galleria-img');
    const LARGHEZZA_SCREEN = 640;
    const ALTEZZA_SCREEN = 480;   // proporzioni 4:3, come i riquadri della galleria

    // una seconda camera, solo per gli screen: così quella principale non si muove
    const cameraScreen = new THREE.PerspectiveCamera(45, LARGHEZZA_SCREEN / ALTEZZA_SCREEN, 0.1, 100);

    let screenDaFare = false;
    let timerScreen = null;

    // quando cambi qualcosa nel pannello, gli screen si aggiornano poco dopo
    // (aspetto 0.8 secondi: il tempo che colori, stanghette e luce finiscano di cambiare)
    function programmaScreen() {
        if (immaginiGalleria.length === 0) return;
        clearTimeout(timerScreen);
        timerScreen = setTimeout(function() { screenDaFare = true; }, 800);
    }
    const pannello = sezione.querySelector('.pannello');
    pannello.addEventListener('click', programmaScreen);
    pannello.addEventListener('input', programmaScreen);

    // per ogni immagine: disegno la scena dalla sua vista e la trasformo in una foto (PNG)
    function scattaScreen() {
        // il renderer disegna per un attimo a 640×480, senza cambiare la grandezza
        // del visore sulla pagina (il "false" finale), poi torna com'era
        const grandezzaVisore = renderer.getSize(new THREE.Vector2());
        renderer.setSize(LARGHEZZA_SCREEN, ALTEZZA_SCREEN, false);

        immaginiGalleria.forEach(function(img) {
            cameraScreen.position.copy(posizioneVista(img.dataset.vista, LARGHEZZA_SCREEN / ALTEZZA_SCREEN));
            cameraScreen.lookAt(0, 0, 0);
            renderer.render(scena, cameraScreen);
            img.src = renderer.domElement.toDataURL('image/png');   // il contenuto del canvas come immagine
        });

        renderer.setSize(grandezzaVisore.x, grandezzaVisore.y, false);
        renderer.render(scena, camera);   // ridisegno subito il visore, così non si vede nessuno scatto
    }


    // ----- le viste -----

    // calcola dove mettere la camera per vedere tutto il modello, partendo dalle sue misure
    // (contando anche Misura e Grandezza, cioè la scala del contenitore)
    function posizioneVista(nome, aspetto) {
        aspetto = aspetto || camera.aspect;   // le proporzioni dell'immagine (larghezza / altezza)
        const scala = contenitore.scale.x;
        const larghezza = dimensioniModello.x * scala;
        const altezza = dimensioniModello.y * scala;
        const profondita = dimensioniModello.z * scala;

        // la camera vede un angolo di 45° in verticale: con la tangente di metà angolo
        // si calcola quanto lontano stare perché una certa misura entri nell'inquadratura
        const metaAngolo = THREE.MathUtils.degToRad(camera.fov / 2);
        const tangente = Math.tan(metaAngolo);
        const MARGINE = 1.3;   // un po' di spazio intorno al modello

        function distanzaPerVedere(base, alto) {
            const perAltezza = (alto / 2) / tangente;
            const perBase = (base / 2) / (tangente * aspetto);
            return Math.max(perAltezza, perBase) * MARGINE;
        }

        if (nome === 'orizzontale') {
            // di fronte, all'altezza del centro: si vedono larghezza e altezza
            return new THREE.Vector3(0, 0, distanzaPerVedere(larghezza, altezza) + profondita / 2);
        }
        if (nome === 'verticale') {
            // dall'alto: si vedono larghezza e profondità
            // (0.01 invece di 0 evita che la camera "si blocchi" esattamente sopra il centro)
            return new THREE.Vector3(0, distanzaPerVedere(larghezza, profondita) + altezza / 2, 0.01);
        }
        // prospettica (ed esplora): in diagonale, un po' dall'alto;
        // il modello sta tutto dentro una sfera con questo raggio
        const raggio = Math.sqrt(larghezza ** 2 + altezza ** 2 + profondita ** 2) / 2;
        const d = (raggio / Math.sin(metaAngolo)) * 1.05;
        return new THREE.Vector3(3, 2, 4).normalize().multiplyScalar(d);
    }

    // porta la camera alla vista scelta; con "esplora" il modello poi gira da solo
    function vaiAllaVista(nome) {
        if (!dimensioniModello) return;   // il modello non è ancora caricato
        destinazioneCamera = posizioneVista(nome);
        controlli.autoRotate = false;     // durante il viaggio sta fermo...
        esplora = (nome === 'esplora');   // ...e se è "esplora", gira quando la camera arriva
    }

    const viste = sezione.querySelectorAll('.vista');
    viste.forEach(function(vista) {
        vista.addEventListener('click', function() {
            seleziona(vista, viste);
            vaiAllaVista(vista.dataset.vista);
        });
    });


    // ----- misura e grandezza -----

    // le misure: il modello si ingrandisce o rimpicciolisce secondo data-scala
    const misure = sezione.querySelectorAll('.misura');
    misure.forEach(function(misura) {
        misura.addEventListener('click', function() {
            seleziona(misura, misure);
            aggiornaScala();
        });
    });

    // la grandezza: il cursore va da 50% a 150% e si moltiplica per la misura scelta
    const cursore = sezione.querySelector('.cursore');
    if (cursore) {
        cursore.addEventListener('input', function() {
            const valore = cursore.closest('.opzione').querySelector('.opzione-valore');
            valore.textContent = cursore.value + '%';
            aggiornaScala();
        });
    }

    // calcola la scala finale unendo misura e grandezza
    function aggiornaScala() {
        const misuraScelta = sezione.querySelector('.misura.selected');
        const misura = misuraScelta ? Number(misuraScelta.dataset.scala) : 1;
        const grandezza = cursore ? Number(cursore.value) / 100 : 1;
        const scala = misura * grandezza;
        contenitore.scale.set(scala, scala, scala);

        // il modello ha cambiato grandezza: ricalcolo la distanza della vista scelta
        const vistaScelta = sezione.querySelector('.vista.selected');
        vaiAllaVista(vistaScelta ? vistaScelta.dataset.vista : 'prospettica');
    }
}


// ===== avvio: un configuratore per ogni elemento .configuratore della pagina =====

document.querySelectorAll('.configuratore').forEach(creaConfiguratore);
