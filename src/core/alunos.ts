import { clickComEvaluate, iniciar } from "../utils/funcoes";

type ConfigAlunos = {
    login: string,
    password: string
    indiceTurma: number
}

type ConfigTurmas = {
    login: string,
    password: string
}

const url = 'https://sed.educacao.sp.gov.br/MinhasTurmas/GridAcesso'

export async function buscarTurmas(config: ConfigTurmas) {

    const { sucesso, mensagem, page, browser} = await iniciar({
        login: config.login,
        password: config.password,
        url
    });

    if (!sucesso || !page || !browser) {

        return {
            sucesso: false,
            mensagem: "Erro ao navegar iniciar - Detalhe do erro: " + mensagem
        }
    }

    let turmas: string[] = [];

    try {
        console.log("Buscando turmas");

        turmas = await page.evaluate(() => {
            const turmas: string[] = [];
    
            document.querySelectorAll('#tabelaDados tbody tr td:nth-child(3)')
            .forEach((el) => turmas.push((el as HTMLElement).innerText));
    
            return turmas;
        });
        
    } catch (error) {
        console.error(`Erro ao buscar turmas - Detalhe do erro:` + error);
        
        return {
            sucesso: false,
            mensagem: `Erro ao buscar turmas - Detalhe do erro:` + error
        }
    }

    return {
        sucesso: true,
        mensagem: `Buscado turmas com sucesso`,
        turmas
    }
}

export async function buscarAlunos(config: ConfigAlunos) {

    const { sucesso, mensagem, page, browser} = await iniciar({
        login: config.login,
        password: config.password,
        url
    });

    if (!sucesso || !page || !browser) {

        return {
            sucesso: false,
            mensagem: "Erro ao navegar iniciar - Detalhe do erro: " + mensagem
        }
    }

    try {
        console.log(`Selecionando turma ${config.indiceTurma}`);
        
        await clickComEvaluate(page, `#tabelaDados tbody tr:nth-child(${config.indiceTurma}) .icone-tabela-alunos`)
    
        await page.waitForSelector('#tbAlunos')
    
        await page.select('select[name="tbAlunos_length"]', '100');
        
    } catch (error) {
        console.error(`Erro ao selecionar turma ${config.indiceTurma} - Detalhe do erro:` + error);
        
        return {
            sucesso: false,
            mensagem: `Erro ao selecionar turma ${config.indiceTurma} - Detalhe do erro:` + error
        }
    }

    let alunos: string[] = [];

    try {
        console.log("Buscando alunos");
    
        alunos = await page.evaluate(() => {
            const alunos: string[] = [];
    
            document.querySelectorAll(`#tbAlunos tbody tr td:nth-child(2)`)
            .forEach((el) => alunos.push((el as HTMLElement).innerText.trim()));
    
            return alunos;
        });
        
    } catch (error) {
        console.error(`Erro ao buscar alunos - Detalhe do erro:` + error);
        
        return {
            sucesso: false,
            mensagem: `Erro ao buscar alunos - Detalhe do erro:` + error
        }
    }

    return {
        sucesso: true,
        mensagem: `Buscado alunos com sucesso`,
        alunos
    }
    
}