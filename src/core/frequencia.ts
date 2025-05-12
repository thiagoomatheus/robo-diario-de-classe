import { isToday, parse } from "date-fns";
import { navegarParaUrl, selecionarMateria, selecionandoData, abrindoSeletorHorario, selecionandoHorario, clickComEvaluate, marcarFalta, iniciar } from "../utils/funcoes";
import { BTN_LISTAR_ALUNOS_SELECTOR, BTN_SALVAR_FALTA_SELECTOR, BTN_SIM_SELECTOR, DATEPICKER_SELECTOR, HORARIO_SELECTOR } from "../utils/seletores";

type ConfigFrequencia = {
    data: string,
    alunosComFalta: number[],
    login: string,
    password: string
}

const url = 'https://frequencia.sed.educacao.sp.gov.br/Frequencia/Index'

export const marcarFrequencia = (async (config: ConfigFrequencia) => {

  const { data, alunosComFalta, login, password } = config;

  console.log('Iniciando...');

  console.log("Data: " + data);

  const eHoje = isToday(parse(data, 'dd/MM/yyyy', new Date()));

  const { sucesso, mensagem, page, browser} = await iniciar({
    login,
    password,
    url
  });
  
  if (!sucesso || !page || !browser) {

    return {
      sucesso: false,
      mensagem: "Erro ao navegar iniciar - Detalhe do erro: " + mensagem
    }
  }

  let marcadoFalta = false;
  
  while(!marcadoFalta) {
    
    for (let i = 1; i < 6; i++) {

      await navegarParaUrl(page, url);
      
      const MATERIA_SELECTOR = `#tabelaInfoProfessorResp tbody tr:nth-child(${i}) #btnAlunos`;
      
      await selecionarMateria(page, MATERIA_SELECTOR);

      // Página de Matéria

      await page.waitForSelector(DATEPICKER_SELECTOR);

      if (!eHoje) {

        // Selecionando data
        
        const dataAtiva = await selecionandoData(page, data, "frequencia", {
          DATE_SELECTOR: `td[title="${data}"] a`,
          DATE_TD_SELECTOR: `td[title="${data}"]`,
          DATEPICKER_SELECTOR: DATEPICKER_SELECTOR
        });

        if (!dataAtiva.sucesso) {
          console.warn(`Data inválida. Causa: ${dataAtiva.mensagem}`);
          break;
        }
      }

      console.log("Verificando horários");
  
      await abrindoSeletorHorario(page);
  
      try {
        await page.waitForSelector(HORARIO_SELECTOR, { timeout: 5000 });
      } catch (error) {
        console.warn(`Horário não encontrado para i=${i}. Pulando para a próxima iteração.`);
        continue;
      }
  
      const horario = await page.evaluate((HORARIO_SELECTOR) => {
        return document.querySelector(HORARIO_SELECTOR)?.id
      }, HORARIO_SELECTOR);
  
      if (!horario) {
        console.warn(`Horário não encontrado para i=${i}. Pulando para a próxima iteração.`);
        continue;
      }

      console.log("Selecionando horário");
      
      await selecionandoHorario(page, "unico");
  
      await page.waitForSelector(BTN_LISTAR_ALUNOS_SELECTOR);

      console.log("Listando alunos");
  
      await clickComEvaluate(page, BTN_LISTAR_ALUNOS_SELECTOR);

      console.log("Marcando alunos com falta");
  
      await marcarFalta(page, alunosComFalta);

      console.log("Salvando falta");

      console.log('.rodape-botao input');

      await page.evaluate(() => {
        
        const btnSalvarFalta = document.querySelector('.rodape-botao input') as HTMLElement;
        btnSalvarFalta.click();
      }, );
    
      /* await clickComEvaluate(page, BTN_SALVAR_FALTA_SELECTOR); */

      console.log("Confirmando falta");

      await page.waitForSelector(BTN_SIM_SELECTOR);
      
      await clickComEvaluate(page, BTN_SIM_SELECTOR);

      await page.waitForResponse('https://frequencia.sed.educacao.sp.gov.br/Frequencia/IncluirPresenca')

      marcadoFalta = true

      break
    }
    
    break
  }

  await browser?.close();

  return {
    sucesso: true,
    mensagem: "Frequência marcada com sucesso!"
  }
  
});