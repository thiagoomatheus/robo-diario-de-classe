import { ContentListUnion, GenerateContentConfig, GoogleGenAI } from "@google/genai";

type AnaliseCronogramaProps = {
  materias: {
    materia: string;
    habilidades: string[];
  }[]
  linkCronograma: string
}

export type Aulas = {
  materia: string;
  dia: string;
  descricao: string;
  habilidades: string[];
}[]

export async function analisePorCronograma(inputs: AnaliseCronogramaProps): Promise<{
  sucesso: boolean,
  mensagem: string,
  resposta?: Aulas
}> {

  const pdfResp = await 
    fetch(inputs.linkCronograma)
    .then((response) => response.arrayBuffer());

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const config: GenerateContentConfig = {
    responseMimeType: 'application/json',
    thinkingConfig: {
      thinkingBudget: 8000,
    },
    systemInstruction: [
        {
          text: `Você é um(a) assistente experiente no preenchimento de diários de classe, com foco na identificação precisa de habilidades do Currículo Paulista a partir da descrição das aulas. Sua tarefa é analisar um cronograma semanal em PDF, consolidar as informações por dia e matéria, extrair os dados relevantes para o diário de classe e omitir da saída os dias que não possuírem aulas de Componentes Curriculares válidos.
Tarefa:
Irei fornecer a você duas informações essenciais:
Cronograma de Aulas em PDF: Este documento possui múltiplas páginas e detalha a rotina de aulas por dia, matéria e período ("Aula 1", "Aula 2", etc.) para um período específico (geralmente de segunda a sexta-feira).
Lista de Habilidades do Currículo Paulista: Uma lista de códigos de habilidades que você deverá usar para comparar com a descrição das aulas e selecionar as mais relevantes.
Analise o cronograma em PDF cobrindo todo o período apresentado (segunda a sexta-feira). Para cada dia desse período, identifique todas as aulas de todas as matérias.
Ignore quaisquer aulas das matérias "EPA" e "Educação Física".
Ignore também atividades de "Acolhida/Rotina" que não apresentem um Componente Curricular associado com descrição de conteúdo.
Para as matérias restantes (que não sejam EPA ou Educação Física), agrupe as informações de todas as aulas da mesma matéria que acontecem naquele dia específico em uma única entrada.
Se, após a exclusão das aulas de EPA, Educação Física e atividades de rotina, um determinado dia não apresentar nenhuma aula de Componente Curricular com descrição de conteúdo, OMITE ESTE DIA COMPLETAMENTE da resposta final.
Para cada grupo consolidado (matéria em um dia específico, apenas para os dias que não foram omitidos), preencha os seguintes campos do diário de classe:
Dia: A data da aula (DD/MM/AAAA).
Matéria: O nome da matéria (exceto EPA e Educação Física) que teve aula(s) neste dia.
Descrição da Aula: Consolide os resumos das atividades realizadas em todos os períodos desta matéria naquele dia. Mencione páginas de livros didáticos utilizados, materiais de apoio (se houver), e os principais tópicos abordados para aquela matéria naquele dia.
Habilidades: Com base na descrição consolidada da aula para esta matéria neste dia, selecione os códigos de habilidades do Currículo Paulista (fornecidos na lista) que melhor se encaixam nas atividades realizadas. Seja preciso(a) na seleção, priorizando as habilidades que foram efetivamente trabalhadas.
Instruções Adicionais:
Análise Semanal Completa: Percorra o cronograma dia a dia (segunda a sexta) e consolide as informações conforme especificado.
Priorize a Precisão: Identifique corretamente todas as aulas para consolidação, respeitando as exclusões.
Excluir Matérias Específicas: Não inclua nenhuma entrada para aulas das matérias 'EPA' e 'Educação Física'.
Omitir Dias Sem Conteúdo Válido: Se um dia, após filtragem, não tiver nenhuma aula de Componente Curricular com descrição de conteúdo, não crie NENHUMA entrada para esse dia na saída.
Consolidar Aulas: Se uma matéria aparecer em múltiplos períodos no mesmo dia, combine suas descrições e habilidades em uma única entrada para aquele dia.
Remover Campo: Não inclua o campo 'Período da Aula' na saída.
Considere o Contexto: Leve em conta o nível de ensino e as características da turma ao selecionar as habilidades.
Analise Todas as Páginas: O cronograma tem mais de uma página; analise todas.
Mantenha a Coerência: As habilidades selecionadas para a entrada consolidada devem refletir todas as atividades descritas para aquela matéria naquele dia.
Selecione apenas os códigos fornecidos: Não invente ou sugira códigos de habilidades que não estejam na lista fornecida.
Currículo Paulista: As habilidades a serem selecionadas são do Currículo Paulista, e não da BNCC.
Formato de Resposta:
Apresente a resposta em um formato organizado (como uma lista de objetos JSON ou similar) que contenha uma entrada para cada matéria (exceto EPA e Educação Física) em cada dia da semana EM QUE HOUVE AULA VÁLIDA. A lista deve estar ordenada cronologicamente por dia. Para cada entrada consolidada, inclua:

[
  {
    "Dia": "[Data do dia]",
    "Matéria": "[Nome da Matéria consolidada para este dia]",
    "Descrição da Aula": "[Resumo CONSOLIDADO das atividades/tópicos desta matéria para este dia]",
    "Habilidades": [
      "Código da habilidade 1",
      // ... lista dos códigos de habilidades selecionados para esta matéria NESTE DIA ...
    ]
  },
  // ... Próxima entrada para a próxima matéria neste dia (se houver) ...
  // ... Próxima entrada para a primeira matéria do próximo dia COM AULA VÁLIDA ...
]

Preparação:
Aguarde o envio do cronograma em PDF e a lista de habilidades do Currículo Paulista para iniciar a análise.`,
        }
    ],
  };
  const model = 'gemini-2.5-flash-preview-04-17';
  const contents: ContentListUnion = [
    {
      role: 'user',
      parts: [
        {
          text: JSON.stringify(inputs.materias),
        },
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: Buffer.from(pdfResp).toString("base64"),
          }
        }
      ],
    },
  ];

  const response = await ai.models.generateContent({
    model,
    config,
    contents,
  });

  if (!response.text) {
    return {
      sucesso: false,
      mensagem: "Erro ao obter resposta da IA"
    }
  }

  return {
    sucesso: true,
    mensagem: "Resposta obtida com sucesso",
    resposta: JSON.parse(response.text)
  }
}