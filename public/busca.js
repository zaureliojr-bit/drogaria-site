/* Motor de busca DrogaLink: uma mesma regra para a grade e sugestões. */
(function (raiz) {
    function semAcento(texto) {
        return String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    }
    const MINIMO_DE_LETRAS = 2;
    const LIGACAO = new Set(["de","da","do","das","dos","com","para","e","a","o","em","no","na","que","ao"]);
    const indiceCache = new WeakMap();
    function tokens(texto) {
        return semAcento(texto)
            .replace(/(\d)[,.](\d)/g, "$1.$2")
            .replace(/(\d)(?=[a-z])/g, "$1 ")
            .replace(/([a-z])(?=\d)/g, "$1 ")
            .match(/[a-z]+|\d+(?:\.\d+)?/g) || [];
    }
    function palavras(termo) {
        const todas = tokens(String(termo ?? "").slice(0, 160));
        const uteis = todas.filter(t => !LIGACAO.has(t));
        return (uteis.length ? uteis : todas).slice(0, 16);
    }
    function indexar(p) {
        if (indiceCache.has(p)) return indiceCache.get(p);
        const nome = tokens(p.nome || p.descricao);
        const marca = tokens([p.marca,p.laboratorio].filter(Boolean).join(" "));
        const outros = tokens([p.busca,p.familiaNome,p.categoria,p.subcategoria,p.substancia].filter(Boolean).join(" "));
        const d = {nome:[...new Set(nome)], marca:[...new Set(marca)], outros:[...new Set(outros)], frase:nome.join(" ")};
        indiceCache.set(p,d);
        return d;
    }
    function casa(token, termo) {
        if (token === termo) return 2;
        // Número/dosagem nunca usa aproximação ou prefixo.
        return /^[a-z]+$/.test(termo) && termo.length >= 3 && token.startsWith(termo) ? 1 : 0;
    }
    function formas(termo, sinonimos, consulta) {
        const list = Array.isArray(sinonimos?.[termo]) ? sinonimos[termo] : [];
        const plurais = {fraldas:"fralda",cremes:"creme",shampoos:"shampoo",absorventes:"absorvente",sabonetes:"sabonete",desodorantes:"desodorante",vitaminas:"vitamina",escovas:"escova",condicionadores:"condicionador"};
        const equivalentes = consulta.includes("fralda") || consulta.includes("fraldas")
            ? ({ geriatrica:["adulta","adulto","geriatricas","adultas"], geriatricas:["geriatrica","adulta","adulto","adultas"], adulta:["geriatrica","geriatricas","adulto"], adulto:["geriatrica","geriatricas","adulta"] }[termo] || [])
            : [];
        return [...new Set([termo, ...(plurais[termo]?[plurais[termo]]:[]), ...list.flatMap(v => { const t=tokens(v); return t.length===1?t:[]; }), ...equivalentes])];
    }
    // Uma edição ou uma troca de letras vizinhas; nunca aplicado a números.
    function erroDeUmaLetra(a,b) {
        if (a===b || a.length<5 || b.length<5 || !/^[a-z]+$/.test(a+b) || Math.abs(a.length-b.length)>1) return false;
        if (a.length===b.length) {
            const dif=[];
            for(let i=0;i<a.length;i++) if(a[i]!==b[i]) dif.push(i);
            return dif.length===1 || (dif.length===2 && dif[1]===dif[0]+1 && a[dif[0]]===b[dif[1]] && a[dif[1]]===b[dif[0]]);
        }
        const [curto,longo]=a.length<b.length?[a,b]:[b,a];
        let i=0,j=0,erros=0;
        while(i<curto.length && j<longo.length) {
            if(curto[i]===longo[j]) {i++;j++;} else {j++;if(++erros>1)return false;}
        }
        return true;
    }
    function pontuar(p, consulta, formasConsulta, aproximar) {
        const d=indexar(p);
        let total=0, corrigidos=0;
        for (let k=0;k<consulta.length;k++) {
            const termo=consulta[k], opcoes=formasConsulta[k];
            let melhor=0;
            for (const [i,forma] of opcoes.entries()) {
                for (const [lista,peso] of [[d.nome,12],[d.marca,7],[d.outros,3]]) {
                    for(const palavra of lista) {
                        const match=casa(palavra,forma);
                        if(match) melhor=Math.max(melhor,peso+match*2-(i?2:0));
                    }
                }
            }
            if(!melhor && aproximar && corrigidos===0 &&
                [...d.nome,...d.marca].some(t=>erroDeUmaLetra(termo,t))) { melhor=1; corrigidos++; }
            if(!melhor) return null;
            total+=melhor;
        }
        const frase=consulta.join(" ");
        if(d.frase===frase) total+=40;
        else if(d.frase.startsWith(frase+" ")) total+=18;
        else if((" "+d.frase+" ").includes(" "+frase+" ")) total+=9;
        return {total,corrigidos};
    }
    let ultimaBusca = null;
    function buscar(produtos, termo, opcoes={}) {
        const chave=semAcento(termo);
        if(ultimaBusca && ultimaBusca.produtos===produtos && ultimaBusca.chave===chave && ultimaBusca.sinonimos===opcoes.sinonimos) return ultimaBusca.resultado;
        const resultado=buscarSemCache(produtos,termo,opcoes);
        ultimaBusca={produtos,chave,sinonimos:opcoes.sinonimos,resultado};
        return resultado;
    }
    function buscarSemCache(produtos, termo, opcoes={}) {
        const raw=semAcento(termo);
        const consulta=palavras(raw);
        if(!Array.isArray(produtos)) return {lista:[],aproximada:false};
        if(!consulta.length) return {lista:[...produtos],aproximada:false};
        const codigo=raw.replace(/[\s.-]/g,"");
        if(/^\d+$/.test(raw) || (/^[\d\s.-]+$/.test(raw) && codigo.length>=8 && /^\d+$/.test(codigo))) {
            const exatos=produtos.filter(p=>p && (String(p.codigo??"").trim()===codigo || String(p.ean??"").trim()===codigo));
            if(exatos.length) return {lista:exatos.sort((a,b)=>Number(a.temEstoque===false)-Number(b.temEstoque===false)),aproximada:false};
            // Códigos longos inexistentes não viram buscas aproximadas.
            if(codigo.length>=8 && !/\s/.test(raw)) return {lista:[],aproximada:false};
        }
        const formasConsulta=consulta.map(t=>formas(t,opcoes.sinonimos,consulta));
        function selecionar(aproximar) {
            const achados=[];
            for(const p of produtos) {
                if(!p || !p.nome) continue;
                const score=pontuar(p,consulta,formasConsulta,aproximar);
                if(score && (!aproximar || score.corrigidos)) achados.push({p,score:score.total});
            }
            achados.sort((a,b)=>Number(a.p.temEstoque===false)-Number(b.p.temEstoque===false) ||
                b.score-a.score || a.p.nome.length-b.p.nome.length || a.p.nome.localeCompare(b.p.nome,"pt-BR"));
            return achados.map(x=>x.p);
        }
        let lista=selecionar(false);
        if(lista.length || !consulta.some(t=>t.length>=5 && /^[a-z]+$/.test(t))) return {lista,aproximada:false};
        lista=selecionar(true);
        return {lista,aproximada:lista.length>0};
    }
    function sugestoes(produtos, termo, opcoes={}) {
        if(semAcento(termo).length<MINIMO_DE_LETRAS) return {lista:[],aproximada:false};
        const {lista,aproximada}=buscar(produtos,termo,opcoes);
        const vistos=new Set(), resultado=[];
        for(const p of lista) {
            const chave=semAcento(p.nome);
            if(vistos.has(chave)) continue;
            vistos.add(chave); resultado.push(p);
            if(resultado.length>=(opcoes.limite||6)) break;
        }
        return {lista:resultado,aproximada};
    }
    function sugerir(produtos, termo, opcoes={}) { return sugestoes(produtos,termo,opcoes).lista; }

    /* A mesma limpeza, mas LETRA POR LETRA, para a posição encontrada
       valer no texto original.

       O semAcento acima serve para comparar; para recortar não serve:
       ele apara as pontas (muda o começo) e, num texto que já venha
       decomposto, "á" ocupa dois caracteres e vira um — a partir dali
       todo índice anda, e o destaque sai deslocado no meio da palavra.
       Aqui cada caractere de entrada produz exatamente um de saída. */
    function limpoCaractereACaractere(texto) {

        let saida = "";

        for (const letra of String(texto || "")) {
            const limpo = letra.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            saida += limpo.length ? limpo[0] : letra.toLowerCase();
        }

        return saida;

    }

    /* Onde o trecho digitado aparece no nome — para a tela poder
       destacá-lo. Devolve as três partes em vez de HTML pronto: quem
       monta HTML é a página, que sabe escapar o que veio do catálogo. */
    function partesDoDestaque(nome, termo) {

        const texto = String(nome || "");
        const procurado = semAcento(termo);

        if (!procurado) return { antes: texto, meio: "", depois: "" };

        const onde = limpoCaractereACaractere(texto).indexOf(procurado);

        if (onde < 0) return { antes: texto, meio: "", depois: "" };

        return {
            antes: texto.slice(0, onde),
            meio: texto.slice(onde, onde + procurado.length),
            depois: texto.slice(onde + procurado.length)
        };

    }

    raiz.Busca = { buscar, sugerir, sugestoes, partesDoDestaque, MINIMO_DE_LETRAS };

})(typeof globalThis !== "undefined" ? globalThis : window);
