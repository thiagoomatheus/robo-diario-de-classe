import { Page } from "puppeteer"
import { abrindoSeletorHorario, clickComEvaluate, iniciar, navegarParaUrl, selecionandoData, selecionandoHorario, selecionarBimestre, selecionarMateria, sleep } from "../utils/funcoes"
import { analisePorCronograma } from "../utils/ia"
import { parseISO } from "date-fns"
import { URL } from "node:url"

type ConfigAula = {
    login: string
    password: string
    bimestre: string
    linkCronograma: string
}

type ResponsePostSalvarAula = {
    "Sucesso": boolean,
    "Erro": string,
    "ApiCentroMidia": boolean,
    "ApiCentroMidiaDisponivel": boolean,
    "TarefasCentroMidiaNaoEnviada": string[] | null,
    "Mensagens": string[] | null,
    "TipoEnsino": string | null
}

const url = 'https://sed.educacao.sp.gov.br/RegistroAula/Index'

async function buscarHabilidades(page: Page, bimestre: string): Promise<{
    materia: string;
    habilidades: string[];
}[]> {

    let quantidadeMaterias = 0;
  
    try {

        quantidadeMaterias = await page.evaluate(() => {
            return document.querySelectorAll('#tabelaDadosTurma tbody tr').length
        })

        console.log(`Quantidade de Materias: ${quantidadeMaterias}`);

    } catch (error) {
        console.error(`Erro ao obter quantidade de Materias - Detalhe do erro:`, error);
        throw new Error("Erro ao obter quantidade de Materias - Detalhe do erro: " + error);
    }
      
    let materias: {
    materia: string,
    habilidades: string[]
    }[] = [];
  
    for (let i = 1; materias.length < quantidadeMaterias; i++) {

        console.log(`Materia: ${i}/${quantidadeMaterias}`);
    
        try {
            
            const MATERIA_SELECTOR = `#tabelaDadosTurma tbody tr:nth-child(${i}) .icone-tabela-visualizar`;
            
            await page.waitForSelector(MATERIA_SELECTOR);
            
            await clickComEvaluate(page, MATERIA_SELECTOR);

            console.log(`Indo para página de matéria`);

            // Página de Matéria

            let materia: string = "";

            try {
            
                await page.waitForSelector('label[for="NomeDisciplina"]');

                materia = await page.evaluate(() => {
                    return (document.querySelector('label[for="NomeDisciplina"] + div') as HTMLElement).innerText.trim();
                })

                console.log(`Materia: ${materia}`);
            
            } catch (error) {
                console.error(`Erro ao obter Materia - Detalhe do erro:`, error);
                throw new Error("Erro ao obter Materia - Detalhe do erro: " + error);
            }

            const resultadoSelecionarBimestre = await selecionarBimestre(page, bimestre);

            if (!resultadoSelecionarBimestre.sucesso) {
                throw new Error("Erro ao selecionar bimestre - Detalhe do erro: " + resultadoSelecionarBimestre.mensagem)
            }

            let habilidades: string[] = [];

            try {
            
                await page.waitForSelector('select[name="tblHabilidadeFundamento_length"]');

                await page.select('select[name="tblHabilidadeFundamento_length"]', '100');

                habilidades = await page.evaluate(() => {

                    let array: string[] = [];

                    document.querySelectorAll('#tblHabilidadeFundamento tbody tr td:nth-child(2)')
                    .forEach(el => array.push((el as HTMLElement).innerText))

                    return array
                })

            } catch (error) {
                console.error(`Erro ao selecionar habilidades - Detalhe do erro:`, error);
                throw new Error("Erro ao selecionar habilidades - Detalhe do erro: " + error);
            }

            materias.push({ materia, habilidades });

            try {

                console.log(`Voltando para página de Registro de Aula`);
                
                await page.goto(url, {
                    waitUntil: 'networkidle0'
                })
        
            } catch (error) {
                console.error(`Erro ao acessar ${url} - Detalhe do erro:`, error);
                throw new Error("Erro ao acessar " + url + " - Detalhe do erro: " + error);
            }
            
        } catch (error) {
            console.error(`Erro ao selecionar materia - Detalhe do erro:`, error);
        }
    }

    return materias
    
}

export const registrarAula = async (config: ConfigAula) => {

    const { linkCronograma, bimestre } = config;
  
    const { sucesso, mensagem, page, browser} = await iniciar({
        login: config.login,
        password: config.password,
        url: url
    });

    if (!sucesso || !page || !browser) {

        return {
            sucesso: false,
            mensagem: "Erro ao navegar iniciar - Detalhe do erro: " + mensagem
        }
    }

    let materias: {
        materia: string,
        habilidades: string[]
    }[] = [];
  
    try {
        materias = await buscarHabilidades(page, bimestre);
    } catch (error) {
        return {
            sucesso: false,
            mensagem: `${error}`
        }
    }
  
    console.log(materias);

    console.log(`Analisando cronograma...`);

    const resultado = await analisePorCronograma({
        materias,
        linkCronograma
    })

    if (!resultado.sucesso || !resultado.resposta) {
        console.error(`Erro ao analisar cronograma - Detalhe do erro:`, resultado.mensagem);

        return {
            sucesso: false,
            mensagem: `Erro ao analisar cronograma - Detalhe do erro: ${resultado.mensagem}`
        }
    }

    const { resposta: aulas } = resultado;

    console.log(aulas);

    let sucessoCount = 0;
    let falhaCount = 0;
    const logs: string[] = [];
    let mensagemFinal = "";

    try {
        console.log(`Registrando aulas...`);
    
        let i = 0;
    
        while (i < aulas.length) {

            const aula = aulas[i];

            const maximoTentativas = 3;
            let tentativa = 0;

            let aulaRegistrada = false;
    
            console.log(`--- Iniciando registro para aula de ${aula.materia} - ${aula.dia} ---`);
    
            while (tentativa < maximoTentativas && !aulaRegistrada) {
                console.log(`Tentativa: ${tentativa + 1}/${maximoTentativas} para ${aula.materia} - ${aula.dia}`);
    
                try {
    
                    const indiceMateria = materias.findIndex(materia => materia.materia === aula.materia);
                    const MATERIA_SELECTOR = `#tabelaDadosTurma tbody tr:nth-child(${indiceMateria + 1}) .icone-tabela-visualizar`;
    
                    console.log(`Indo para página de materia`);
                    await navegarParaUrl(page, url);
                    await page.waitForSelector(MATERIA_SELECTOR);

                    console.log(`Selecionando materia de ${aula.materia}`);
    
                    const resultadoSelecionarMateria = await selecionarMateria(page, MATERIA_SELECTOR);
                    if (!resultadoSelecionarMateria.sucesso) {
                        console.warn(`Erro ao selecionar materia - Detalhe do erro:`, resultadoSelecionarMateria.mensagem);
                        throw new Error(resultadoSelecionarMateria.mensagem);
                    }
    
                    await sleep(2000);
                    
                    console.log(`Adicionando aula de ${aula.materia} - ${aula.dia}`);
    
                    console.log(`Selecionando bimestre ${bimestre}`);
                    await selecionarBimestre(page, bimestre);
                    
                    console.log(`Selecionando data ${aula.dia}`);
                    const dataAtiva = await selecionandoData(page, aula.dia, "aula", {
                        DATE_SELECTOR: ``,
                        DATE_TD_SELECTOR: ``,
                        DATEPICKER_SELECTOR: ".datepicker"
                    });
                    if (!dataAtiva.sucesso) {
                        console.warn(`Data inválida. Causa: ${dataAtiva.mensagem}`);

                        if (dataAtiva.mensagem !== 'Data não encontrada!') {

                            await sleep(2000);

                            break;
                        }

                        throw new Error(dataAtiva.mensagem);
                    }
    
                    await sleep(2000);
    
                    console.log(`Selecionando horário`);
                    await abrindoSeletorHorario(page);
                    await selecionandoHorario(page, "todos");
                    
                    console.log("Selecionando exibição de 100 habilidades");
                    await page.waitForSelector('select[name="tblHabilidadeFundamento_length"]');
                    await page.select('select[name="tblHabilidadeFundamento_length"]', '100');
                    
                    console.log("Inserindo habilidades");
                    await page.waitForSelector('#tblHabilidadeFundamento_filter input[type="search"]');
                    let habilidades = aula.habilidades;
                    for (let k = 0; k < habilidades.length; k++) {
                        await page.type('#tblHabilidadeFundamento_filter input[type="search"]', habilidades[k]);
                        const elemento = await page.$(`#tblHabilidadeFundamento tbody tr:nth-child(1) td:nth-child(1) input`);
                        if (elemento) {
                            await clickComEvaluate(page, `#tblHabilidadeFundamento tbody tr:nth-child(1) td:nth-child(1) input`);
                        } else {
                            console.warn(`Habilidade "${habilidades[k]}" não encontrada. Prosseguindo.`);
                        }
                        await page.type('#tblHabilidadeFundamento_filter input[type="search"]', '');
                    }

                    console.log("Inserindo descricao da aula");
                    await page.waitForSelector('#txtBreveResumo');
                    await page.type('#txtBreveResumo', aula.descricao);
                    
                    console.log("Salvando aula");
                    console.log(`Clicando no botão para salvar...`);

                    await sleep(500);
    
                    await Promise.all([
                        page.waitForResponse('https://sed.educacao.sp.gov.br/RegistroAula/Salvar', { timeout: 10000 }),
                        page.waitForSelector('#btnSalvarCadastro', { visible: true }),
                        clickComEvaluate(page, '#btnSalvarCadastro')
                    ]);
    
                    console.log(`Aula de ${aula.materia} - ${aula.dia} adicionada com sucesso na tentativa ${tentativa + 1}!`);
                    aulaRegistrada = true;
                    
                } catch (error: any) {
                    console.warn(`Falha na tentativa ${tentativa + 1} para adicionar aula de ${aula.materia} - ${aula.dia}. Detalhe do erro:`, error.message || error);
                }
    
                if (!aulaRegistrada && tentativa < maximoTentativas) {
                    tentativa++;
                } else if (!aulaRegistrada && tentativa === maximoTentativas) {
                    console.error(`!!! Todas as ${maximoTentativas} tentativas para aula de ${aula.materia} - ${aula.dia} falharam. Avançando para a próxima aula.`);
                }
            }

            if (aulaRegistrada) {
                sucessoCount++;
                logs.push(`Aula de ${aula.materia} - Dia ${aula.dia} - Registrada com sucesso!`);
            } else {
                falhaCount++;
                logs.push(`Aula de ${aula.materia} - Dia ${aula.dia} - Falha ao registrar após ${tentativa} tentativas.`);
            }

            i++;
        }

        const totalAulasProcessadas = sucessoCount + falhaCount;
        mensagemFinal = falhaCount === 0
            ? "Registro de aulas realizado com sucesso!"
            : `Registro de aulas concluído. ${sucessoCount} aulas registradas e ${falhaCount} falharam.`;

        console.log(`--- Resumo Final ---`);
        console.log(`Total de aulas processadas: ${totalAulasProcessadas}`);
        console.log(`Sucessos: ${sucessoCount}`);
        console.log(`Falhas: ${falhaCount}`);
        console.log(`Mensagem: ${mensagemFinal}`);
        console.log(`---------------------`);
    
    } catch (error) {
        console.error(`Erro fatal ao iterar sobre aulas ou iniciar o processo:`, error);
        return {
            sucesso: false,
            mensagem: `Erro fatal no processo de registro de aulas - Detalhe do erro: ${error}`
        };
    }
    
    await browser?.close();
  
    console.log('Finalizado!');

    return {
        sucesso: true,
        mensagem: mensagemFinal,
        relatorio: {
            sucesso: sucessoCount,
            falhas: falhaCount,
            logs: logs
        }
    };
}

export async function registrarAulaViaRequest(config: ConfigAula) {
    
    const { linkCronograma, bimestre } = config;
  
    const { sucesso, mensagem, page, browser} = await iniciar({
        login: config.login,
        password: config.password,
        url: url
    });

    if (!sucesso || !page || !browser) {

        return {
            sucesso: false,
            mensagem: "Erro ao navegar iniciar - Detalhe do erro: " + mensagem
        }
    }

    let materias: {
        materia: string,
        habilidades: string[]
    }[] = [];
  
    try {
        materias = await buscarHabilidades(page, bimestre);
    } catch (error) {
        return {
            sucesso: false,
            mensagem: `${error}`
        }
    }
  
    console.log(materias);

    console.log(`Analisando cronograma...`);

    const resultado = await analisePorCronograma({
        materias,
        linkCronograma
    })

    if (!resultado.sucesso || !resultado.resposta) {
        console.error(`Erro ao analisar cronograma - Detalhe do erro:`, resultado.mensagem);

        return {
            sucesso: false,
            mensagem: `Erro ao analisar cronograma - Detalhe do erro: ${resultado.mensagem}`
        }
    }

    const { resposta: aulas } = resultado;

    console.log(aulas);

    let sucessoCount = 0;
    let falhaCount = 0;
    const logs: string[] = [];
    let mensagemFinal = "";

    try {
        console.log(`Registrando aulas...`);
    
        let i = 0;
    
        while (i < aulas.length) {

            const aula = aulas[i];

            const maximoTentativas = 3;
            let tentativa = 0;

            let aulaRegistrada = false;
    
            console.log(`--- Iniciando registro para aula de ${aula.materia} - ${aula.dia} ---`);
    
            while (tentativa < maximoTentativas && !aulaRegistrada) {
                console.log(`Tentativa: ${tentativa + 1}/${maximoTentativas} para ${aula.materia} - ${aula.dia}`);
    
                try {
    
                    const indiceMateria = materias.findIndex(materia => materia.materia === aula.materia);
                    const MATERIA_SELECTOR = `#tabelaDadosTurma tbody tr:nth-child(${indiceMateria + 1}) .icone-tabela-visualizar`;
    
                    console.log(`Indo para página de materia`);
                    await navegarParaUrl(page, url);
                    await page.waitForSelector(MATERIA_SELECTOR);

                    console.log(`Selecionando materia de ${aula.materia}`);
    
                    const resultadoSelecionarMateria = await selecionarMateria(page, MATERIA_SELECTOR);
                    if (!resultadoSelecionarMateria.sucesso) {
                        console.warn(`Erro ao selecionar materia - Detalhe do erro:`, resultadoSelecionarMateria.mensagem);
                        throw new Error(resultadoSelecionarMateria.mensagem);
                    }
    
                    await sleep(2000);
                    
                    console.log(`Adicionando aula de ${aula.materia} - ${aula.dia}`);
    
                    console.log(`Selecionando bimestre ${bimestre}`);
                    await selecionarBimestre(page, bimestre);
                    
                    console.log(`Selecionando data ${aula.dia}`);
                    const dataAtiva = await selecionandoData(page, aula.dia, "aula", {
                        DATE_SELECTOR: ``,
                        DATE_TD_SELECTOR: ``,
                        DATEPICKER_SELECTOR: ".datepicker"
                    });
                    if (!dataAtiva.sucesso) {
                        console.warn(`Data inválida. Causa: ${dataAtiva.mensagem}`);

                        if (dataAtiva.mensagem !== 'Data não encontrada!') {

                            await sleep(2000);

                            break;
                        }

                        throw new Error(dataAtiva.mensagem);
                    }
    
                    await sleep(2000);
    
                    console.log(`Buscando horário(s)`);
                    
                    const horarios = await page.evaluate(() => {
                        const elementos = document.querySelectorAll('#chHorario');
                        const horarios: string[] = [];

                        elementos.forEach((elemento) => {
                            horarios.push((elemento as HTMLInputElement).value);
                        })

                        return horarios;
                    })
                    
                    console.log("Selecionando exibição de 100 habilidades");
                    await page.waitForSelector('select[name="tblHabilidadeFundamento_length"]');
                    await page.select('select[name="tblHabilidadeFundamento_length"]', '100');
                    
                    console.log("Buscando habilidades");
                    let habilidades = aula.habilidades;

                    const codigosHabilidades: number[] = await page.evaluate((habilidades) => {
                        const elementos = document.querySelectorAll('#tblHabilidadeFundamento tbody tr');

                        return Array.from(elementos)
                        .filter(elemento => habilidades.includes((elemento as HTMLElement).querySelector('td:nth-child(2)')?.textContent || ''))
                        .map(elemento => {
                            const input = (elemento as HTMLElement).querySelector('input[type="checkbox"]') as HTMLInputElement;
                            return input ? parseInt(input.value) : null;
                        })
                        .filter(codigo => codigo !== null);
                    }, habilidades);

                    console.log("Buscando código da turma");

                    const codigoDaTurma: number | null = await page.evaluate(() => {
                        const input = document.querySelector('#hdCodigoTurma') as HTMLInputElement;
                        return input ? parseInt(input.value) : null;
                    })

                    if (!codigoDaTurma) {
                        throw new Error("Não foi possivel obter o código da turma");
                    }

                    console.log("Buscando código da disciplina");

                    const codigoDaDisciplina: number | null = await page.evaluate(() => {
                        const input = document.querySelector('#hdCodigoDisciplina') as HTMLInputElement;
                        return input ? parseInt(input.value) : null;
                    })

                    if (!codigoDaDisciplina) {
                        throw new Error("Não foi possivel obter o código da materia");
                    }

                    console.log("Buscando código da aula");

                    const CodigoRegAula: string | null = await page.evaluate(() => {
                        const input = document.querySelector('#hdCodigoRegAula') as HTMLInputElement;
                        return input ? input.value : null;
                    })

                    if (!CodigoRegAula) {
                        throw new Error("Não foi possivel obter o código da aula");
                    }

                    console.log("Manipulando dados");

                    const dataString = `${aula.dia.split('/').reverse().join('-')}T03:00:00.000Z`

                    const payloadData = {
                        "CodigoRegAula": CodigoRegAula,
                        "Data": dataString,
                        "Selecao": 
                            codigosHabilidades ? codigosHabilidades.map(codigo => {
                                return {
                                    "Conteudo": codigo,
                                    "Habilidade": codigo,
                                    "Data": `/Date(${parseISO(dataString).getTime()})/`
                                }
                            }) : [],
                        "SelecaoEixo": [],
                        "Bimestre": bimestre,
                        "Observacoes": "",
                        "CodigoTurma": codigoDaTurma,
                        "CodigoDisciplina": codigoDaDisciplina,
                        "Horarios": horarios.join(','),
                        "RecursosAula": {
                            "Recursos": [],
                            "Resumo": aula.descricao
                        },
                        "FlAprenderJunto": false,
                        "Nr_Ra": "",
                        "Nr_Dig_Ra": "",
                        "Sg_Uf_Ra": "",
                        "DsResumo": aula.descricao,
                        "TarefasApiCm": []
                    };

                    const payload = JSON.stringify(payloadData);
                    
                    console.log("Buscando token de autenticação");

                    console.log(`Indo para página de materia`);
                    await navegarParaUrl(page, url);
                    
                    const csrfToken = await page.evaluate(() => {
                        const tokenInput = document.querySelector<HTMLInputElement>('input[name="__RequestVerificationToken"]');
                        return tokenInput ? tokenInput.value : null;
                    });
                    
                    if (!csrfToken) {
                        throw new Error('Erro: __RequestVerificationToken não encontrado na página. A automação pode falhar.');
                    }
                    
                    const cookies = await browser.cookies();
                    const csrfCookie = cookies.find(cookie => cookie.name === '__RequestVerificationToken');
                    const csrfTokenFromCookie = csrfCookie ? csrfCookie.value : null;
                    
                    console.log(`CSRF Token (DOM): ${csrfToken}`);
                    console.log(`CSRF Token (Cookie): ${csrfTokenFromCookie}`);
                    
                    const csrfTokenToSend = csrfTokenFromCookie || csrfToken;
                    
                    const formData = new URLSearchParams();
                    formData.append('str', payload);

                    console.log('Enviando requisição POST...');
                    
                    console.log(formData.toString());

                    const currentPageUrl = page.url();

                    const responseData = await page.evaluate(async (formData, urlReferer, urlOrigin) => {

                        const response = await fetch('https://sed.educacao.sp.gov.br/RegistroAula/Salvar', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                'Accept': 'application/json, text/javascript, */*; q=0.01',
                                'X-Requested-With': 'XMLHttpRequest',
                                'Referer': urlReferer,
                                'Origin': urlOrigin,
                                'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36',
                            },
                            body: formData.toString(),
                            credentials: 'include'
                        });

                        const contentType = response.headers.get('content-type');
                        if (contentType && contentType.includes('application/json')) {
                            console.log(response.status);
                            return response.json();
                        } else {
                            console.log(response.status);
                            return response.text();
                        }

                        /* const jsonResponse: ResponsePostSalvarAula = await response.json();

                        console.log(jsonResponse);

                        if (!jsonResponse.Sucesso) {
                            throw new Error(`Requisição POST falhou: ${jsonResponse.Erro}`);
                        }
                        
                        return jsonResponse.Sucesso; */
                    }, formData, currentPageUrl, new URL(currentPageUrl).origin);

                    console.log('Requisição POST enviada com sucesso!');
                    console.log(`Resposta do servidor: ${responseData}`);
                    
                    console.log('Resposta do servidor: Sucesso - ', /* responseData */);
    
                    console.log(`Aula de ${aula.materia} - ${aula.dia} adicionada com sucesso na tentativa ${tentativa + 1}!`);
                    aulaRegistrada = true;
                    
                } catch (error: any) {
                    console.warn(`Falha na tentativa ${tentativa + 1} para adicionar aula de ${aula.materia} - ${aula.dia}. Detalhe do erro:`, error.message || error);
                }
    
                if (!aulaRegistrada && tentativa < maximoTentativas) {
                    tentativa++;
                } else if (!aulaRegistrada && tentativa === maximoTentativas) {
                    console.error(`!!! Todas as ${maximoTentativas} tentativas para aula de ${aula.materia} - ${aula.dia} falharam. Avançando para a próxima aula.`);
                }
            }

            if (aulaRegistrada) {
                sucessoCount++;
                logs.push(`Aula de ${aula.materia} - Dia ${aula.dia} - Registrada com sucesso!`);
            } else {
                falhaCount++;
                logs.push(`Aula de ${aula.materia} - Dia ${aula.dia} - Falha ao registrar após ${tentativa} tentativas.`);
            }

            i++;
        }

        const totalAulasProcessadas = sucessoCount + falhaCount;
        mensagemFinal = falhaCount === 0
            ? "Registro de aulas realizado com sucesso!"
            : `Registro de aulas concluído. ${sucessoCount} aulas registradas e ${falhaCount} falharam.`;

        console.log(`--- Resumo Final ---`);
        console.log(`Total de aulas processadas: ${totalAulasProcessadas}`);
        console.log(`Sucessos: ${sucessoCount}`);
        console.log(`Falhas: ${falhaCount}`);
        console.log(`Mensagem: ${mensagemFinal}`);
        console.log(`---------------------`);
    
    } catch (error) {
        console.error(`Erro fatal ao iterar sobre aulas ou iniciar o processo:`, error);
        return {
            sucesso: false,
            mensagem: `Erro fatal no processo de registro de aulas - Detalhe do erro: ${error}`
        };
    }
    
    await browser?.close();
  
    console.log('Finalizado!');

    return {
        sucesso: true,
        mensagem: mensagemFinal,
        relatorio: logs
    };

}


export async function registrarAulaViaRequestTeste(config: ConfigAula) {

    const { linkCronograma, bimestre } = config;

    const { sucesso, mensagem, page, browser } = await iniciar({
        login: config.login,
        password: config.password,
        url: url
    });

    if (!sucesso || !page || !browser) {
        return {
            sucesso: false,
            mensagem: "Erro ao iniciar o navegador ou login: " + mensagem
        };
    }

    let materias: {
        materia: string,
        habilidades: string[]
    }[] = [];

    try {
        materias = await buscarHabilidades(page, bimestre);
    } catch (error: any) {
        return {
            sucesso: false,
            mensagem: `Erro ao buscar habilidades: ${error.message || error}`
        };
    }

    console.log(materias);

    console.log(`Analisando cronograma...`);

    const resultado = await analisePorCronograma({
        materias,
        linkCronograma
    });

    if (!resultado.sucesso || !resultado.resposta) {
        console.error(`Erro ao analisar cronograma:`, resultado.mensagem);
        return {
            sucesso: false,
            mensagem: `Erro ao analisar cronograma: ${resultado.mensagem}`
        };
    }

    const { resposta: aulas } = resultado;

    console.log(aulas);

    let sucessoCount = 0;
    let falhaCount = 0;
    const logs: string[] = [];
    let mensagemFinal = "";

    // MODIFICAÇÃO IMPORTANTE: Habilitar interceptação de requisições uma vez
    await page.setRequestInterception(true);

    // Variável para armazenar o payloadData para a requisição atual que será interceptada
    let currentPayloadData: any = null;

    // MODIFICAÇÃO IMPORTANTE: Listener para interceptar e modificar a requisição POST de salvar aula
    page.on('request', async (request) => {
        if (request.url().includes('/RegistroAula/Salvar') && request.method() === 'POST') {
            try {
                // Capturar os dados originais que o clique no botão geraria
                const originalPostData = request.postData();
                const originalHeaders = request.headers();

                // Analisar o corpo da requisição original (que é application/x-www-form-urlencoded)
                const params = new URLSearchParams(originalPostData || '');
                let str = params.get('str'); // O seu payload JSON está dentro do parâmetro 'str'
                
                // O __RequestVerificationToken já estará no formData original que o navegador gerou.
                // Não precisamos manipulá-lo aqui, pois o browser já está enviando o par correto.
                // const csrfTokenFromRequest = params.get('__RequestVerificationToken'); 

                if (str && currentPayloadData) {
                    // Decodificar e parsear o JSON original para poder modificá-lo com os seus dados
                    // (Lembre-se que o payloadData é montado com seus dados limpos,
                    // e agora estamos garantindo que a versão final enviada contenha eles)
                    let originalPayloadObject = JSON.parse(decodeURIComponent(str.replace(/\+/g, ' ')));

                    // Sobrescrever com os dados que você preparou em `currentPayloadData`
                    // Isso garante que CodigoRegAula seja "" para nova aula, habilidades estejam corretas, etc.
                    const finalPayloadObject = { ...originalPayloadObject, ...currentPayloadData };

                    // Re-stringificar o JSON modificado e URL-encode novamente
                    const newStr = encodeURIComponent(JSON.stringify(finalPayloadObject));
                    
                    // Colocar o 'str' modificado de volta nos parâmetros
                    params.set('str', newStr);

                    // Reconstruir o corpo da requisição completo
                    const newPostData = params.toString();

                    // Prosseguir com a requisição, usando os cabeçalhos originais (que o navegador já populou corretamente)
                    // e o postData modificado.
                    await request.continue({ postData: newPostData, headers: originalHeaders });
                } else {
                    console.error("Parâmetro 'str' ou 'currentPayloadData' ausente na requisição de salvar aula. Abortando.");
                    await request.abort(); // Abortar a requisição se não puder modificá-la
                }

            } catch (error: any) {
                console.error(`Erro ao interceptar e modificar requisição POST de salvar aula: ${error.message || error}`);
                await request.abort(); // Abortar em caso de erro na modificação
            }
        } else {
            // Permitir que outras requisições (CSS, JS, imagens, etc.) continuem normalmente
            await request.continue();
        }
    });


    try {
        console.log(`Registrando aulas...`);

        let i = 0;

        while (i < aulas.length) {
            const aula = aulas[i];
            const maximoTentativas = 3;
            let tentativa = 0;
            let aulaRegistrada = false;

            console.log(`--- Iniciando registro para aula de ${aula.materia} - ${aula.dia} ---`);

            while (tentativa < maximoTentativas && !aulaRegistrada) {
                console.log(`Tentativa: ${tentativa + 1}/${maximoTentativas} para ${aula.materia} - ${aula.dia}`);

                try {
                    const indiceMateria = materias.findIndex(materia => materia.materia === aula.materia);
                    const MATERIA_SELECTOR = `#tabelaDadosTurma tbody tr:nth-child(${indiceMateria + 1}) .icone-tabela-visualizar`;

                    console.log(`Indo para página de materia`);
                    await navegarParaUrl(page, url); // Garante que estamos na página de registro de aula
                    await page.waitForSelector(MATERIA_SELECTOR);

                    console.log(`Selecionando materia de ${aula.materia}`);
                    const resultadoSelecionarMateria = await selecionarMateria(page, MATERIA_SELECTOR);
                    if (!resultadoSelecionarMateria.sucesso) {
                        console.warn(`Erro ao selecionar materia - Detalhe do erro:`, resultadoSelecionarMateria.mensagem);
                        throw new Error(resultadoSelecionarMateria.mensagem);
                    }

                    await sleep(2000); // Dar tempo para a página carregar após selecionar a matéria

                    console.log(`Adicionando aula de ${aula.materia} - ${aula.dia}`);

                    console.log(`Selecionando bimestre ${bimestre}`);
                    await selecionarBimestre(page, bimestre);

                    console.log(`Selecionando data ${aula.dia}`);
                    const dataAtiva = await selecionandoData(page, aula.dia, "aula", {
                        DATE_SELECTOR: ``,
                        DATE_TD_SELECTOR: ``,
                        DATEPICKER_SELECTOR: ".datepicker"
                    });
                    if (!dataAtiva.sucesso) {
                        console.warn(`Data inválida. Causa: ${dataAtiva.mensagem}`);
                        if (dataAtiva.mensagem !== 'Data não encontrada!') {
                            await sleep(2000);
                            break; // Se a data for realmente inválida, não tentar novamente
                        }
                        throw new Error(dataAtiva.mensagem);
                    }

                    await sleep(2000); // Dar tempo para a página atualizar após selecionar a data

                    console.log(`Buscando horário(s)`);
                    const horarios = await page.evaluate(() => {
                        const elementos = document.querySelectorAll('#chHorario');
                        const horarios: string[] = [];
                        elementos.forEach((elemento) => {
                            horarios.push((elemento as HTMLInputElement).value);
                        });
                        return horarios;
                    });

                    console.log("Selecionando exibição de 100 habilidades");
                    await page.waitForSelector('select[name="tblHabilidadeFundamento_length"]');
                    await page.select('select[name="tblHabilidadeFundamento_length"]', '100');
                    
                    // Aguardar um pouco para a tabela de habilidades recarregar após a seleção de 100
                    await sleep(1000);

                    console.log("Buscando habilidades");
                    const codigosHabilidades: number[] = await page.evaluate((habilidadesArray) => {
                        const elementos = document.querySelectorAll('#tblHabilidadeFundamento tbody tr');
                        return Array.from(elementos)
                            .filter(elemento => habilidadesArray.includes((elemento as HTMLElement).querySelector('td:nth-child(2)')?.textContent || ''))
                            .map(elemento => {
                                const input = (elemento as HTMLElement).querySelector('input[type="checkbox"]') as HTMLInputElement;
                                return input ? parseInt(input.value) : null;
                            })
                            .filter((codigo): codigo is number => codigo !== null); // Type guard para filtrar nulls
                    }, aula.habilidades);

                    console.log("Buscando código da turma");
                    const codigoDaTurma: number | null = await page.evaluate(() => {
                        const input = document.querySelector('#hdCodigoTurma') as HTMLInputElement;
                        return input ? parseInt(input.value) : null;
                    });
                    if (!codigoDaTurma) {
                        throw new Error("Não foi possivel obter o código da turma");
                    }

                    console.log("Buscando código da disciplina");
                    const codigoDaDisciplina: number | null = await page.evaluate(() => {
                        const input = document.querySelector('#hdCodigoDisciplina') as HTMLInputElement;
                        return input ? parseInt(input.value) : null;
                    });
                    if (!codigoDaDisciplina) {
                        throw new Error("Não foi possivel obter o código da materia");
                    }

                    console.log("Buscando código da aula (para nova aula, deve ser vazio)");
                    // MODIFICAÇÃO IMPORTANTE: Garantir que CodigoRegAula seja vazio para nova aula
                    const codigoRegAulaRaw: string | null = await page.evaluate(() => {
                        const input = document.querySelector('#hdCodigoRegAula') as HTMLInputElement;
                        return input ? input.value : null;
                    });
                    const codigoRegAulaParaPayload = (codigoRegAulaRaw === null || codigoRegAulaRaw === "0") ? "" : codigoRegAulaRaw;


                    console.log("Preparando payload de dados para injeção...");
                    const dataString = `${aula.dia.split('/').reverse().join('-')}T03:00:00.000Z`; // Formato ISO para JS Date

                    // NOVO: Montar o payload de dados que você quer que seja enviado.
                    // Este será o `currentPayloadData` que o interceptor usará para sobrescrever.
                    currentPayloadData = {
                        "CodigoRegAula": codigoRegAulaParaPayload, // Corrigido para ser "" para nova aula
                        "Data": dataString,
                        "Selecao": codigosHabilidades.length > 0 ? codigosHabilidades.map(codigo => {
                            return {
                                "Conteudo": codigo,
                                "Habilidade": codigo,
                                "Data": `/Date(${parseISO(dataString).getTime()})/`
                            };
                        }) : [], // Garante que Selecao é um array, mesmo se vazio
                        "SelecaoEixo": [],
                        "Bimestre": bimestre,
                        "Observacoes": "",
                        "CodigoTurma": codigoDaTurma,
                        "CodigoDisciplina": codigoDaDisciplina,
                        "Horarios": horarios.join(','),
                        "RecursosAula": {
                            "Recursos": [],
                            "Resumo": aula.descricao
                        },
                        "FlAprenderJunto": false,
                        "Nr_Ra": "",
                        "Nr_Dig_Ra": "",
                        "Sg_Uf_Ra": "",
                        "DsResumo": aula.descricao,
                        "TarefasApiCm": []
                    };
                    
                    console.log('Disparando clique no botão de salvar para enviar a requisição...');
                    // MODIFICAÇÃO IMPORTANTE: Clique no botão que envia o formulário
                    // e espere pela resposta da requisição POST
                    const [response] = await Promise.all([
                        page.waitForResponse(response => response.url().includes('/RegistroAula/Salvar') && response.request().method() === 'POST'),
                        page.waitForSelector('#btnSalvarCadastro', { visible: true }),
                        clickComEvaluate(page, '#btnSalvarCadastro')
                    ]);
                    
                    // Resetar currentPayloadData para evitar interferência em próximas iterações
                    currentPayloadData = null;

                    // Lidar com a resposta da requisição
                    const contentType = response.headers()['content-type'];
                    let responseData: any;

                    if (contentType && contentType.includes('application/json')) {
                        responseData = await response.json();
                        console.log(`Resposta do servidor (JSON): ${JSON.stringify(responseData, null, 2)}`);

                        // A SED geralmente retorna { Sucesso: true, Erro: null } em caso de sucesso
                        if (responseData.Sucesso === true) {
                            console.log(`Aula de ${aula.materia} - ${aula.dia} adicionada com sucesso na tentativa ${tentativa + 1}!`);
                            aulaRegistrada = true;
                        } else {
                            throw new Error(`Requisição POST falhou no backend: ${responseData.Erro || 'Erro desconhecido'}`);
                        }
                    } else {
                        responseData = await response.text();
                        console.warn(`Resposta do servidor não foi JSON. Possível erro ou redirecionamento.`);
                        console.warn(`Resposta do servidor (HTML/Texto): ${responseData.substring(0, 500)}...`);
                        throw new Error(`Servidor retornou HTML/texto (status ${response.status()}) ao invés de JSON. Verifique o arquivo de log.`);
                    }

                } catch (error: any) {
                    console.warn(`Falha na tentativa ${tentativa + 1} para adicionar aula de ${aula.materia} - ${aula.dia}. Detalhe do erro:`, error.message || error);
                }

                if (!aulaRegistrada && tentativa < maximoTentativas - 1) { // Só incrementa se não for a última tentativa
                    tentativa++;
                } else if (!aulaRegistrada && tentativa === maximoTentativas - 1) { // Se falhou na última tentativa
                    console.error(`!!! Todas as ${maximoTentativas} tentativas para aula de ${aula.materia} - ${aula.dia} falharam. Avançando para a próxima aula.`);
                    break; // Sai do loop de tentativas
                }
            }

            if (aulaRegistrada) {
                sucessoCount++;
                logs.push(`Aula de ${aula.materia} - Dia ${aula.dia} - Registrada com sucesso!`);
            } else {
                falhaCount++;
                logs.push(`Aula de ${aula.materia} - Dia ${aula.dia} - Falha ao registrar após ${maximoTentativas} tentativas.`);
            }

            i++;
        }

        const totalAulasProcessadas = sucessoCount + falhaCount;
        mensagemFinal = falhaCount === 0
            ? "Registro de aulas realizado com sucesso!"
            : `Registro de aulas concluído. ${sucessoCount} aulas registradas e ${falhaCount} falharam.`;

        console.log(`--- Resumo Final ---`);
        console.log(`Total de aulas processadas: ${totalAulasProcessadas}`);
        console.log(`Sucessos: ${sucessoCount}`);
        console.log(`Falhas: ${falhaCount}`);
        console.log(`Mensagem: ${mensagemFinal}`);
        console.log(`---------------------`);

    } catch (error: any) {
        console.error(`Erro fatal ao iterar sobre aulas ou iniciar o processo:`, error.message || error);
        return {
            sucesso: false,
            mensagem: `Erro fatal no processo de registro de aulas: ${error.message || error}`
        };
    } finally {
        // MODIFICAÇÃO IMPORTANTE: Desabilitar a interceptação de requisições ao finalizar
        await page.setRequestInterception(false);
        await browser?.close();
    }

    console.log('Finalizado!');

    return {
        sucesso: true,
        mensagem: mensagemFinal,
        relatorio: logs
    };
}