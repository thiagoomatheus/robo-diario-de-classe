import { abrindoSeletorHorario, clickComEvaluate, iniciar, selecionandoData, selecionandoHorario, selecionarBimestre, selecionarMateria } from "../utils/funcoes"
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

    const { resposta } = resultado;

    const aulasDeMatematica: Aulas = [];
    const aulasDeHistoria: Aulas = []
    const aulasDePortugues: Aulas = []
    const aulasDeGeografia: Aulas = []
    const aulasDeArte: Aulas = []
    const aulasDeCiencias: Aulas = []

    resposta.map((aula) => {
        switch (aula.materia) {
            case 'Matemática':
                aulasDeMatematica.push(aula);
                break;
            case 'Língua Portuguesa':
                aulasDePortugues.push(aula);
                break;
            case 'História':
                aulasDeHistoria.push(aula);
                break;
            case 'Geografia':
                aulasDeGeografia.push(aula);
                break;
            case 'Arte':
                aulasDeArte.push(aula);
                break;
            case 'Ciências':
                aulasDeCiencias.push(aula);
                break;
            default:
                break;
        }
    })

    for (let i = 1; materias.length < quantidadeMaterias; i++) {

        let aulas: Aulas = []
        
        switch (i) {
            case 1:
                aulas = aulasDePortugues;
                break;
            case 2:
                aulas = aulasDeArte;
                break;
            case 3:
                aulas = aulasDeGeografia;
                break;
            case 4:
                aulas = aulasDeHistoria;
                break;
            case 5:
                aulas = aulasDeMatematica;
                break;
            case 6:
                aulas = aulasDeCiencias;
                break;
            default:
                break;
        }

        try {
    
            const MATERIA_SELECTOR = `#tabelaDadosTurma tbody tr:nth-child(${i}) .icone-tabela-visualizar`;

            await page.goto(url, {
                waitUntil: 'networkidle0'
            })

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

        aulas.map(async (aula) => {

            try {
                console.log(`Adicionando aula de ${aula.materia} - ${aula.dia}`);
    
                const resultadoSelecionarBimestre = await selecionarBimestre(page, bimestre);
    
                if (!resultadoSelecionarBimestre.sucesso) {
                    console.warn("Erro ao selecionar bimestre - Detalhe do erro: " + resultadoSelecionarBimestre.mensagem);
                    return;
                }
    
                const dataAtiva = await selecionandoData(page, aula.dia, "frequencia", {
                    DATE_SELECTOR: ``,
                    DATE_TD_SELECTOR: ``,
                    DATEPICKER_SELECTOR: ".datepicker"
                });
            
                if (!dataAtiva.sucesso) {
                    console.warn(`Data inválida. Causa: ${dataAtiva.mensagem}`);
                    return;
                }
    
                await page.waitForResponse('https://sed.educacao.sp.gov.br/RegistroAula/CarregarCurriculos');

                await abrindoSeletorHorario(page);

                await selecionandoHorario(page, "todos");

                await page.waitForSelector('select[name="tblHabilidadeFundamento_length"]');

                await page.select('select[name="tblHabilidadeFundamento_length"]', '100');

                await page.waitForSelector('#tblHabilidadeFundamento_filter input[type="search"]');

                aula.habilidades.map(async (habilidade) => {
                    await page.type('#tblHabilidadeFundamento_filter input[type="search"]', habilidade);

                    await clickComEvaluate(page, '#tblHabilidadeFundamento tbody tr:nth-child(1) td:nth-child(1) input');
                })

                await page.waitForSelector('#txtBreveResumo')

                await page.type('#txtBreveResumo', aula.descricao);

                await clickComEvaluate(page, '#btnSalvarCadastro')

                await page.waitForResponse('https://sed.educacao.sp.gov.br/RegistroAula/Salvar')
                
                
            } catch (error) {
                console.error(`Erro ao adicionar aula de ${aula.materia} - Detalhe do erro:`, error);
            }
        })
    }
  
    await browser?.close();
  
    console.log('Finalizado!');

    return {
        sucesso: true,
        mensagem: "Registro de aulas realizado com sucesso!"
    }
}