import { HTTPResponse } from "puppeteer"
import { abrindoSeletorHorario, clickComEvaluate, iniciar, navegarParaUrl, selecionandoData, selecionandoHorario, selecionarBimestre, selecionarMateria } from "../utils/funcoes"
import { analisePorCronograma, Aulas } from "../utils/ia"

type ConfigAula = {
    login: string
    password: string
    bimestre: string
    linkCronograma: string
}

const url = 'https://sed.educacao.sp.gov.br/RegistroAula/Index'

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
  
    let quantidadeMaterias = 0;
  
    try {

        quantidadeMaterias = await page.evaluate(() => {
            return document.querySelectorAll('#tabelaDadosTurma tbody tr').length
        })

        console.log(`Quantidade de Materias: ${quantidadeMaterias}`);

    } catch (error) {
        console.error(`Erro ao obter quantidade de Materias - Detalhe do erro:`, error);
    
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

            }

            const resultadoSelecionarBimestre = await selecionarBimestre(page, bimestre);

            if (!resultadoSelecionarBimestre.sucesso) {

                return {
                    sucesso: false,
                    mensagem: "Erro ao selecionar bimestre - Detalhe do erro: " + resultadoSelecionarBimestre.mensagem
                }
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
            
            }

            materias.push({ materia, habilidades });

            try {

                console.log(`Voltando para página de Registro de Aula`);
                
                await page.goto(url, {
                    waitUntil: 'networkidle0'
                })
        
            } catch (error) {
                console.error(`Erro ao acessar ${url} - Detalhe do erro:`, error);
            }
            
        } catch (error) {
            console.error(`Erro ao selecionar materia - Detalhe do erro:`, error);
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

    try {

        console.log(`Registrando aulas...`);

        for (let i = 0; i < aulas.length; i++) {

            const aula = aulas[i];

            try {

                const indiceMateria = materias.findIndex(materia => materia.materia === aula.materia)
        
                const MATERIA_SELECTOR = `#tabelaDadosTurma tbody tr:nth-child(${indiceMateria + 1}) .icone-tabela-visualizar`;
    
                await navegarParaUrl(page, url);

                await page.waitForSelector(MATERIA_SELECTOR);
    
                console.log(`Selecionando materia de ${aula.materia}`);
                
                const resultadoSelecionarMateria = await selecionarMateria(page, MATERIA_SELECTOR);
    
                if (!resultadoSelecionarMateria.sucesso) {
                    console.warn(`Erro ao selecionar materia - Detalhe do erro:`, resultadoSelecionarMateria.mensagem);
                    continue;
                }
                
            } catch (error) {
    
                console.error(`Erro ao selecionar materia - Detalhe do erro:`, error);
                return {
                    sucesso: false,
                    mensagem: `Erro ao selecionar materia - Detalhe do erro: ${error}`
                }
                
            }

            try {
                console.log(`Adicionando aula de ${aula.materia} - ${aula.dia}`);

                console.log(`Selecionando bimestre ${bimestre}`);

                try {
                    await selecionarBimestre(page, bimestre);
                } catch (error: any) {
                    console.warn("Erro ao selecionar bimestre - Detalhe do erro: " + error.mensagem);
                    return {
                        sucesso: false,
                        mensagem: "Erro ao selecionar bimestre - Detalhe do erro: " + error.mensagem
                    }
                }

                console.log(`Selecionando data ${aula.dia}`);
                
                const dataAtiva = await selecionandoData(page, aula.dia, "aula", {
                    DATE_SELECTOR: ``,
                    DATE_TD_SELECTOR: ``,
                    DATEPICKER_SELECTOR: ".datepicker"
                });
            
                if (!dataAtiva.sucesso) {
                    console.warn(`Data inválida. Causa: ${dataAtiva.mensagem}`);
                    return {
                        sucesso: false,
                        mensagem: `Data inválida. Causa: ${dataAtiva.mensagem}`
                    }
                }
    
                await page.waitForResponse('https://sed.educacao.sp.gov.br/RegistroAula/CarregarCurriculos');

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
                    }
                }

                console.log("Inserindo descricao da aula");

                await page.waitForSelector('#txtBreveResumo');

                await page.type('#txtBreveResumo', aula.descricao);

                console.log("Salvando aula");

                console.log(`Clicando no botão para salvar...`);

                await Promise.all([
                    page.waitForResponse('https://sed.educacao.sp.gov.br/RegistroAula/Salvar', { timeout: 60000 }),
                    clickComEvaluate(page, '#btnSalvarCadastro')
                ])

                console.log(`Aula de ${aula.materia} - ${aula.dia} adicionada com sucesso!`);
                
            } catch (error) {
                console.error(`Erro ao adicionar aula de ${aula.materia} - Detalhe do erro:`, error);
                return {
                    sucesso: false,
                    mensagem: `Erro ao adicionar aula de ${aula.materia} - Detalhe do erro: ${error}`
                }
            }
        }
    } catch (error) {
        console.error(`Erro ao iterar sobre aulas - Detalhe do erro:`, error);

        return {
            sucesso: false,
            mensagem: `Erro ao iterar sobre aulas - Detalhe do erro: ${error}`
        }
        
    }
    
    await browser?.close();
  
    console.log('Finalizado!');

    return {
        sucesso: true,
        mensagem: "Registro de aulas realizado com sucesso!"
    }
}