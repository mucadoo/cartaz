# Cartaz

A calendar of São Paulo cultural programs. Seventeen houses share one month view, with showtimes and, for the museums, the exhibitions open that day.

Live site: [cartaz-mucadoo.vercel.app](https://cartaz-mucadoo.vercel.app/)

Dates and times use `America/Sao_Paulo`. There is no database. Each load reads the public pages of the houses.

## Houses

| House | What is included |
| --- | --- |
| [CineSesc](https://www.sescsp.org.br/programacao/?id=52&unidade=CineSesc) | The CineSesc program, with ticket counts and prices |
| [Cinemateca](https://cinemateca.org.br/programacao/) | The published program. If the server cannot reach it, the visitor’s browser loads it |
| [Cine Belas Artes](https://www.cinebelasartes.com.br/programacao-regular/) | Relançamentos from the regular program, plus the [special program](https://www.cinebelasartes.com.br/programacao-especial/) |
| [Espaço Petrobras](https://espacopetrobrasdecinema.com.br/) | Relançamentos |
| [CINUSP](https://cinusp.webhostusp.sti.usp.br/) | The public program. Admission is free |
| [Sala São Paulo](https://salasaopaulo.art.br/salasp/pt/programacao-ingressos) | The program, including Estação Motiva Cultural. The hall is named on each session |
| [Theatro Municipal](https://theatromunicipal.org.br/programacao/) | The published program |
| [Teatro Baccarelli](https://baccarelli.org.br/nucleos/teatro-baccarelli/#em-cartaz) | What is em cartaz |
| [Theatro São Pedro](https://theatrosaopedro.art.br/programacao/) | The published program |
| [MASP](https://masp.org.br/exposicoes) | Exhibitions on view, on every day they are open |
| [MIS](https://mis-sp.org.br/exposicao/) | Exhibitions on view, on every day they are open |
| [Itaú Cultural](https://www.itaucultural.org.br/agenda) | Exhibitions and ocupações, on every day they are open |
| [Pinacoteca](https://pinacoteca.org.br/programacao/tipo/exposicoes/) | Exhibitions at Pina Luz, Pina Estação, and Pina Contemporânea |
| [MAM](https://mam.org.br/exposicoes/em-cartaz/) | Exhibitions on view at Ibirapuera |
| [Instituto Tomie Ohtake](https://www.institutotomieohtake.org.br/programacao/exposicoes) | Exhibitions at the institute and at the Casa-ateliê |
| [CCBB](https://ccbb.com.br/sao-paulo/programacao/) | Exhibitions at the São Paulo center |
| [Museu Afro Brasil](https://museuafrobrasil.org.br/exposicoes/) | Temporary exhibitions on view |

## Using the calendar

House chips can stay on together. **Todas** shows every house. Click a selected house again to remove it.

**Dia** keeps the month beside the selected day. **Mês** fills each day with every session and every exhibition open that day. **Agenda** lists the month by date. The choice is kept in the browser.

**Tudo** shows every session. **Com lugar** keeps sessions that are still on sale, sold only at the box office, or free.

**Claro** and **Escuro** switch the theme. The first visit follows the system setting, and the choice is kept in the browser. Extensions such as Dark Reader are asked not to restyle the page.

Links to a house, a film, or a ticket open in a new tab. If a house fails to load, **Atualizar** fetches that house again.

## Updates

The page stays cached for 12 hours, so the program refreshes twice a day. A house that still has tickets on sale is fetched every two hours, and the page follows that shorter interval. **Atualizar** skips the cache for the house you choose.

The app is meant to run in São Paulo (`gru1` in `vercel.json`). Some house sites do not answer from other regions.

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint
npm run build
```
