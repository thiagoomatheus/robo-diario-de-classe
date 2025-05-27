import { Page } from "puppeteer"
import { abrindoSeletorHorario, clickComEvaluate, iniciar, navegarParaUrl, selecionandoData, selecionandoHorario, selecionarBimestre, selecionarMateria, sleep } from "../utils/funcoes"
import { analisePorCronograma } from "../utils/ia"
import { parseISO } from "date-fns"

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

            let payload = "";

            try {

                console.log(`--- Iniciando registro para aula de ${aula.materia} - ${aula.dia} ---`);
        
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
    
                payload = JSON.stringify(payloadData);

            } catch (error) {
                
            }

            while (tentativa < maximoTentativas && !aulaRegistrada) {

                console.log(`Tentativa: ${tentativa + 1}/${maximoTentativas} para ${aula.materia} - ${aula.dia}`);
    
                try {

                    console.log(`Indo para página de materia`);
                    await navegarParaUrl(page, url);
    
                    console.log("Buscando token de autenticação");
                    
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
                    formData.append('__RequestVerificationToken', csrfTokenToSend);
                    formData.append('str', payload);

                    console.log('Enviando requisição POST...');
                    
                    console.log(formData.toString());

                    const responseData = await page.evaluate(async (formData) => {

                        const response = await fetch('https://sed.educacao.sp.gov.br/RegistroAula/Salvar', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                'Accept': 'application/json, text/javascript, */*; q=0.01',
                                'X-Requested-With': 'XMLHttpRequest',
                            },
                            body: formData.toString(),
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
                    }, formData);

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