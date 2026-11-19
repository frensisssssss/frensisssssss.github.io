// foto.js – le foto della prova con la fotocamera: scattare, scaricare, inviare per email, Instagram
// (lo usa collezione.js, nella finestra zoom)
//
// Come si condivide una foto da una pagina web:
// - sul telefono c'è la "Web Share API" (navigator.share): apre il menu di condivisione del
//   telefono, con dentro Instagram, Mail, WhatsApp... e la foto viene passata già allegata.
// - sul computer quel menu di solito non c'è (o non ha Instagram), e una pagina web non può
//   allegare file a un'email né pubblicare su Instagram da sola. Allora la foto si scarica
//   e si apre il programma della posta / il sito di Instagram, con le istruzioni.

const TITOLO = 'Triennale Milano · In mostra · Occhiali';

export function creaFoto(zoom, prova, nomeCorrente) {
    const pannello = zoom.querySelector('.foto');
    const anteprima = pannello.querySelector('.foto-anteprima');
    const messaggio = pannello.querySelector('.foto-messaggio');
    const rullino = pannello.querySelector('.foto-rullino');
    const bottoneCondividi = pannello.querySelector('.foto-condividi');
    const scena = zoom.querySelector('.prova-scena');

    const foto = [];       // tutte le foto scattate, la più recente per prima
    let scelta = null;     // la foto mostrata in grande

    function scriviMessaggio(testo) {
        messaggio.textContent = testo;
        messaggio.hidden = testo === '';
    }

    // il telefono/browser sa condividere questo file con il menu di sistema?
    function puoCondividere(file) {
        return !!(navigator.canShare && navigator.canShare({ files: [file] }));
    }

    function testoCondivisione(f) {
        return 'Ecco come mi stanno gli ' + (f.nome ? 'occhiali di ' + f.nome : 'occhiali') + '! ' + TITOLO;
    }

    // es. "occhiali-francesca-galli-3.jpg"
    function nomeFile(nome) {
        const pulito = (nome || 'occhiali').toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')   // toglie gli accenti
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return 'occhiali-' + pulito + '-' + (foto.length + 1) + '.jpg';
    }

    async function scattaFoto() {
        const nome = nomeCorrente();
        const promessa = prova.scatta(nome ? 'Occhiali di ' + nome : '');
        if (!promessa) {
            pannello.hidden = false;
            scriviMessaggio('Aspetta che la fotocamera sia accesa e che il viso sia riconosciuto.');
            return;
        }

        // il "flash": un lampo bianco sul video
        scena.classList.remove('flash');
        void scena.offsetWidth;   // fa ripartire l'animazione anche se si scatta due volte di fila
        scena.classList.add('flash');

        const immagine = await promessa;
        const file = new File([immagine], nomeFile(nome), { type: 'image/jpeg' });
        const f = { file, nome, url: URL.createObjectURL(immagine) };
        foto.unshift(f);

        // la miniatura nel rullino
        const miniatura = document.createElement('button');
        miniatura.type = 'button';
        miniatura.className = 'foto-miniatura';
        miniatura.setAttribute('aria-label', 'Foto ' + foto.length);
        const img = document.createElement('img');
        img.src = f.url;
        img.alt = '';
        miniatura.appendChild(img);
        miniatura.addEventListener('click', function() { seleziona(f); });
        rullino.prepend(miniatura);
        f.miniatura = miniatura;

        pannello.hidden = false;
        scriviMessaggio('');
        seleziona(f);
    }

    function seleziona(f) {
        scelta = f;
        anteprima.src = f.url;
        foto.forEach(function(altra) {
            altra.miniatura.classList.toggle('selected', altra === f);
        });
        // "Condividi" c'è solo se il dispositivo sa farlo (di solito il telefono)
        bottoneCondividi.hidden = !puoCondividere(f.file);
    }

    function scarica(f) {
        const link = document.createElement('a');
        link.href = f.url;
        link.download = f.file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    // apre il menu di condivisione del telefono con la foto allegata
    async function condividi(f) {
        try {
            await navigator.share({ files: [f.file], title: TITOLO, text: testoCondivisione(f) });
            scriviMessaggio('');
        } catch (errore) {
            if (errore.name !== 'AbortError') {   // AbortError = hai chiuso il menu: non è un errore
                console.error(errore);
                scriviMessaggio('Non riesco a condividere la foto: prova a scaricarla.');
            }
        }
    }

    function inviaEmail(f) {
        if (puoCondividere(f.file)) {
            scriviMessaggio('Nel menu scegli Mail (o la tua app della posta): la foto è già allegata.');
            condividi(f);
            return;
        }
        // computer: scarico la foto e apro una nuova email già scritta
        scarica(f);
        const oggetto = encodeURIComponent('La mia foto con gli occhiali');
        const corpo = encodeURIComponent(testoCondivisione(f) + '\n\n(Ricordati di allegare la foto "' + f.file.name + '" che hai appena scaricato.)');
        window.location.href = 'mailto:?subject=' + oggetto + '&body=' + corpo;
        scriviMessaggio('Ho scaricato la foto e aperto una nuova email: allega "' + f.file.name + '" dalla cartella Download.');
    }

    function instagram(f) {
        if (puoCondividere(f.file)) {
            scriviMessaggio('Nel menu scegli Instagram (Feed o Storie).');
            condividi(f);
            return;
        }
        // computer: scarico la foto e apro Instagram in una nuova scheda
        scarica(f);
        window.open('https://www.instagram.com/', '_blank', 'noopener');
        scriviMessaggio('Ho scaricato la foto e aperto Instagram: premi "Crea" (+) e scegli "' + f.file.name + '" dalla cartella Download.');
    }

    zoom.querySelector('.zoom-scatta').addEventListener('click', scattaFoto);
    bottoneCondividi.addEventListener('click', function() { if (scelta) condividi(scelta); });
    pannello.querySelector('.foto-email').addEventListener('click', function() { if (scelta) inviaEmail(scelta); });
    pannello.querySelector('.foto-instagram').addEventListener('click', function() { if (scelta) instagram(scelta); });
    pannello.querySelector('.foto-scarica').addEventListener('click', function() {
        if (!scelta) return;
        scarica(scelta);
        scriviMessaggio('Foto scaricata.');
    });

    // il pannello delle foto si vede solo nella prova, e solo se c'è almeno una foto
    function mostraPannello(inProva) {
        pannello.hidden = !inProva || foto.length === 0;
        scriviMessaggio('');
    }

    return { mostraPannello };
}
