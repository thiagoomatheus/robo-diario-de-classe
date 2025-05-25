import puppeteer, { Browser, Page } from "puppeteer";
import { ANTERIOR_SELECTOR, BUTTON_SELECTOR, HORARIO_SELECTOR, INPUT_DATE_SELECTOR, LOGIN_SELECTOR, PASSWORD_SELECTOR, TIMEPICKER_SELECTOR } from "./seletores";
import { addDays, differenceInCalendarMonths, isThisMonth, parse, subDays } from "date-fns";

type ConfigIniciar = {
  login: string,
  password: string
  url: string
}

export const iniciarNavegacao = async () => {

    console.log("Abrindo navegador");
    
    const browser = await puppeteer.launch({
      args: [
        '--no-sandbox', // ESSENCIAL PARA RODAR NO DOCKER
        '--disable-setuid-sandbox', // Recomendado junto com --no-sandbox
        '--disable-gpu', // Desabilita o uso de GPU (útil em contêineres sem aceleração gráfica)
        '--disable-dev-shm-usage' // Evita problemas com /dev/shm
      ],
    });
  
    const page: Page = await browser.newPage();
  
    console.log("Pagina aberta");

    return { browser, page };
}

export const fazerLogin = async (page: Page, login: string, password: string) => {

    try {

        console.log("Logando...");

        await page.type(LOGIN_SELECTOR, login);
        
        await page.type(PASSWORD_SELECTOR, password);
        
        await page.click(BUTTON_SELECTOR);

        await page.waitForNavigation();
        
    } catch (error) {
      console.error(`Erro ao fazer login - Detalhe do erro:`, error);

      return {
        sucesso: false,
        mensagem: `Erro ao fazer login - Detalhe do erro: ${error}`
      }
    }

    return {
        sucesso: true,
        mensagem: "Login realizado com sucesso - " + login
    }
}

export const navegarParaUrl = async (page: Page, url: string) => {

  try {
    await page.goto(url, {
      waitUntil: 'networkidle0'
    });
  } catch (error) {

    console.error(`Erro ao navegar para ${url} - Detalhe do erro:`, error);

    return {
      sucesso: false,
      mensagem: `Erro ao navegar para ${url} - Detalhe do erro: ${error}`
    }
  }

  console.log(`Navegando para ${url}`);

  return {
    sucesso: true,
    mensagem: `Navegando para ${url}`
  }
};

export async function iniciar(config: ConfigIniciar) {

    const { login, password, url } = config;

    console.log("Iniciando");

    let browser: Browser | null = null;
    
    let page: Page | null = null;
    
    try {
        const resultado = await iniciarNavegacao();
    
        browser = resultado.browser;
    
        page = resultado.page;
    } catch (error) {
        
        console.warn("Erro ao iniciar navegador: " + error);
    
        return {
            sucesso: false,
            mensagem: "Erro ao iniciar navegador: " + error
        }
    }

    const resultadoNavegarHome = await navegarParaUrl(page, 'https://sed.educacao.sp.gov.br/');

    if (!resultadoNavegarHome.sucesso) {

      return {
        sucesso: false,
        mensagem: "Erro ao navegar para https://sed.educacao.sp.gov.br/ - Detalhe do erro: " + resultadoNavegarHome.mensagem
      }
    }
      
    const resultadoLogin = await fazerLogin(page, login, password);

    if (!resultadoLogin.sucesso) {

      return {
        sucesso: false,
        mensagem: "Erro ao fazer login - Detalhe do erro: " + resultadoLogin.mensagem
      }
    }

    const resultadoNavegarUrl = await navegarParaUrl(page, url);

    if (!resultadoNavegarUrl.sucesso) {

        return {
            sucesso: false,
            mensagem: "Erro ao navegar para https://sed.educacao.sp.gov.br/ - Detalhe do erro: " + resultadoNavegarUrl.mensagem
        }
    }

    return {
        sucesso: true,
        mensagem: `Navegado para: ${url}`,
        page,
        browser
    }
    
}

export const clickComEvaluate = async (page: Page, seletor: string) => {

    await page.evaluate((seletor) => {
      const elemento = document.querySelector(seletor) as HTMLElement;

      elemento.click()
    }, seletor);

}

export const selecionarMateria = async (page: Page, seletor: string) => {

    try {
        
        await page.waitForSelector(seletor);
            
        await clickComEvaluate(page, seletor);
    
        console.log(`Indo para página de matéria`);
    } catch (error) {

        console.error(`Erro ao selecionar matéria - Detalhe do erro:`, error);
        return {
            sucesso: false,
            mensagem: `Erro ao selecionar matéria - Detalhe do erro: ${error}`
        }
    }

    return {
        sucesso: true,
        mensagem: `Indo para página de matéria`
    }

};

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const selecionandoData = async (page: Page, data: string, tipo: "frequencia" | "aula", seletores: {
    DATE_TD_SELECTOR: string,
    DATE_SELECTOR: string,
    DATEPICKER_SELECTOR: string
}) => {

  const { DATEPICKER_SELECTOR, DATE_SELECTOR, DATE_TD_SELECTOR } = seletores;

  const dataEmFormatoCorreto: Date = parse(data, 'dd/MM/yyyy', new Date());

  const mesmoMes = isThisMonth(dataEmFormatoCorreto);

  const diaDoMes = dataEmFormatoCorreto.getDate();
  
  try {
    console.log("Abrindo datepicker");

    await page.waitForSelector('.calendar-icon');
    
    await page.evaluate(async () => {

      /* const elemento = document.querySelector(DATEPICKER_SELECTOR) as HTMLElement;

      elemento.style.display = 'block';
      elemento.style.zIndex = '9999'; */

      const icone = document.querySelector('.calendar-icon') as HTMLElement;

      icone.click(); 

    });

    await sleep(2000);
  } catch (error) {
    console.error(`Erro ao abrir datepicker - Detalhe do erro:`, error);

    return {
      sucesso: false,
      mensagem: `Erro ao abrir datepicker - Detalhe do erro: ${error}`
    }
  }

  if (!mesmoMes) {

    try {
      console.log("Verificando diferença de meses");
  
      const diferenca = differenceInCalendarMonths(new Date(), parse(data, 'dd/MM/yyyy', new Date()));
  
      console.log("Meses de Diferença: " + diferenca);
      
      await page.waitForSelector(ANTERIOR_SELECTOR);
  
      for (let i = 0; i < diferenca; i++) {
        console.log("Voltando um mês");
        await clickComEvaluate(page, ANTERIOR_SELECTOR);
      }
  
      await clickComEvaluate(page, ANTERIOR_SELECTOR);
  
      console.log("Selecionado mês correto");
      
    } catch (error) {
      console.error(`Erro ao selecionar mês correto - Detalhe do erro:`, error);

      return {
        sucesso: false,
        mensagem: `Erro ao selecionar mês correto - Detalhe do erro: ${error}`
      }
    }
  }
    
  try {
    console.log("Verificando se data informada está ativa");
    
    switch (tipo) {
      case "frequencia":
        await page.waitForSelector(DATE_TD_SELECTOR);

        const estaAtiva = await page.evaluate((DATE_TD_SELECTOR) => {
  
          const elemento = document.querySelector(DATE_TD_SELECTOR) as HTMLElement;
    
          return elemento.classList.contains('isActive');
        }, DATE_TD_SELECTOR);

        if (!estaAtiva) {
          console.warn("Data de frequência não está ativa.");
          return { sucesso: false, mensagem: "Data de frequência não está ativa." };
        }

        console.log("Data de frequência ativa.");
        
        break;
    
      case "aula":

        await page.waitForFunction(
          (day) => {
            const elements = document.querySelectorAll('.ui-datepicker-calendar td a.ui-state-default');
            for (const el of elements) {

              if (!el.textContent) return false

              if (el.textContent.trim() === String(day)) {
                return true;
              }
            }
            return false;
          },
          {},
          diaDoMes
        );

        await page.waitForSelector('.ui-state-default');

        const dataAtiva = await page.evaluate((diaDoMes) => {
          
          let elementoPai: HTMLElement | null = null;
          const elements = document.querySelectorAll('.ui-datepicker-calendar td a.ui-state-default');

          for (const el of elements) {
            if (!el.textContent) continue;
            if (el.textContent.trim() === String(diaDoMes)) {
              elementoPai = el.parentNode as HTMLElement;
              break;
            }
          }

          if (!elementoPai) {
            return {
              sucesso: false,
              mensagem: `Data não encontrada!`
            }
          }

          if (elementoPai.classList.contains('ui-datepicker-week-end')) {
            return {
              sucesso: false,
              mensagem: `Data é um final de semana!`
            }
          }

          if (elementoPai.classList.contains('datepicker-nao-letivo-color')) {
            return {
              sucesso: false,
              mensagem: `Data é um dia não letivo!`
            }
          }

          if (elementoPai.classList.contains('ui-state-disabled')) {
            return {
              sucesso: false,
              mensagem: `Data é um dia desabilitado!`
            }
          }

          if (elementoPai.classList.contains('dia-verde')) {
            return {
              sucesso: false,
              mensagem: `Data já possui registro de aula!`
            }
          }

          return {
            sucesso: true,
            mensagem: `Data ativa!`
          }
        }, diaDoMes);

        if (!dataAtiva.sucesso) {
          console.warn(`Data de aula inválida: ${dataAtiva.mensagem}`);
          return { sucesso: false, mensagem: `${dataAtiva.mensagem}` };
        } else {
          console.log(`${dataAtiva.mensagem}`);
        }

      break;
    }
  } catch (error) {
    console.error(`Erro ao verificar se data informada está ativa - Detalhe do erro:`, error);
    
    return {
      sucesso: false,
      mensagem: `Erro ao verificar se data informada está ativa - Detalhe do erro: ${error}`
    }
  }

  await sleep(2000);

  try {
    switch (tipo) {

      case "frequencia":

        await Promise.all([
          page.waitForResponse('https://frequencia.sed.educacao.sp.gov.br/Frequencia/GetEventsForMonth'),
          clickComEvaluate(page, DATE_SELECTOR),
          await page.focus(INPUT_DATE_SELECTOR)
          .then(() => page.keyboard.press('Enter'))
          .then(() => console.log("Atualizado horários"))
        ])
      
        break;
    
      case "aula":

        await Promise.all([
          page.waitForResponse('https://sed.educacao.sp.gov.br/RegistroAula/CarregarCurriculos'),
          page.evaluate((diaDoMes) => {
            const elements = document.querySelectorAll('.ui-datepicker-calendar td a.ui-state-default');
  
            for (const el of elements) {
              if (!el.textContent) continue;
              if (el.textContent.trim() === String(diaDoMes)) {
                (el as HTMLElement).click();
                break;
              }
            }
          }, diaDoMes)
        ])


        break;
    }
    
  } catch (error) {
    console.error(`Erro ao selecionar data - Detalhe do erro:`, error);

    return {
      sucesso: false,
      mensagem: `Erro ao selecionar data - Detalhe do erro: ${error}`
    }
  }

  return {
    sucesso: true,
    mensagem: `Data selecionada com sucesso`
  }
    
}

export async function selecionarBimestre(page: Page, bimestre:string) {
  try {

    await page.waitForSelector(`#bimestres option[value="${bimestre}"]`, {timeout: 5000})
    .then(async () => {

      await clickComEvaluate(page, `#bimestres option[value="${bimestre}"]`);
      
      await page.waitForSelector(`#hdfFiltroBimestre[value="${bimestre}"]`);
  
      console.log(`Bimestre: ${bimestre}`);
    })
    .catch(error => {
      console.error(`Erro ao selecionar bimestre - Detalhe do erro:`, error);
      throw new Error(error);
    })

  } catch (error) {
      console.error(`Erro ao selecionar bimestre - Detalhe do erro:`, error);

      return {
        sucesso: false,
        mensagem: `Erro ao selecionar bimestre - Detalhe do erro: ${error}`
      }

  }

  return {
    sucesso: true,
    mensagem: `Bimestre selecionado com sucesso`
  }
}

export const selecionandoHorario = async (page: Page, tipoDeSelecao: "unico" | "todos") => {

  switch (tipoDeSelecao) {
    case "unico":

      await clickComEvaluate(page, HORARIO_SELECTOR);

      await page.waitForSelector('#chHorario:checked');
      
      break;
    case "todos":
      await page.evaluate(() => {
          const horarios = document.querySelectorAll('#chHorario');
    
          horarios.forEach((horario) => {
              (horario as HTMLInputElement).click();
          })
      })
      break;
  }

  await page.waitForSelector(HORARIO_SELECTOR);

    await clickComEvaluate(page, HORARIO_SELECTOR);
}

export const abrindoSeletorHorario = async (page: Page) => await page.evaluate(() => {
    setTimeout(() => {
      const seletorHorario = document.querySelector(TIMEPICKER_SELECTOR) as HTMLElement;
      seletorHorario.style.display = 'block';
    }, 1000)
})

export const marcarFalta = async (page: Page, alunosComFalta: number[]) => {

  await page.waitForSelector(`#frequencias_wrapper tbody tr #divPresenca`, { visible: true });

  alunosComFalta.map(async (numeroDoAluno) => {
    
    page.evaluate((numeroDoAluno) => {
      const elemento = document.querySelector(`#frequencias_wrapper tbody tr:nth-child(${numeroDoAluno}) #divPresenca`) as HTMLElement;
      elemento.click();
      console.log(`Aluno ${numeroDoAluno} marcado com sucesso`);
      
    }, numeroDoAluno)
  });
}