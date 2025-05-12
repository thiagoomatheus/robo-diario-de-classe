import { prisma } from "./utils/prisma";
import { buscarAlunos, buscarTurmas } from "./core/alunos";
import { marcarFrequencia } from "./core/frequencia";
import { FastifyTypedInstance } from "./types";
import { z } from "zod";
import { registrarAula } from "./core/aulas";
import jwt from 'jsonwebtoken';
import { JWT_EXPIRES_IN, JWT_SECRET } from "../config";
import { authenticateJWT } from "./hooks/auth";

export default async function routes(app: FastifyTypedInstance) {

  app.post('/usuarios', {
    schema: {
      tags: ['Usuários'],
      description: 'Cria um novo usuário.',
      body: z.object({
        telefone: z.string(),
        login: z.string(),
        adminApiKey: z.string(),
      }),
      response: {
        200: z.object({
          sucesso: z.boolean(),
          mensagem: z.string(),
        }),
        400: z.object({
          sucesso: z.boolean(),
          mensagem: z.string(),
        }),
        500: z.object({
          sucesso: z.boolean(),
          mensagem: z.string(),
        }),
      },
    },
  }, async (req, reply) => {
    const { telefone, login, adminApiKey } = req.body;

    if (!telefone || !login) {
      return reply.status(400).send({
        sucesso: false,
        mensagem: 'Telefone e login obrigatórios.',
      });
    }

    if (adminApiKey !== process.env.ADMIN_API_KEY) {
      return reply.status(400).send({
        sucesso: false,
        mensagem: 'Chave de admin inválida.',
      });
    }

    try {
      await prisma.usuario.create({
        data: {
          telefone: telefone,
          login: login,
        }
      });

      return reply.status(200).send({
        sucesso: true,
        mensagem: 'Usuário criado com sucesso.',
      });
    } catch (error) {
      return reply.status(500).send({
        sucesso: false,
        mensagem: 'Erro ao criar usuário: ' + error,
      });
    }
  });

  app.post('/token', {
    schema: {
      tags: ['Autenticação'],
      description: 'Gera um token de acesso para um usuário cadastrado.',
      body: z.object({
        telefone: z.string(),
        apiKey: z.string(),
      }),
      response: {
        200: z.object({
          sucesso: z.boolean(),
          token: z.string(),
          expiraEm: z.string(),
          login: z.string(),
        }),
        400: z.object({
          sucesso: z.boolean(),
          mensagem: z.string(),
        }),
        404: z.object({
          sucesso: z.boolean(),
          mensagem: z.string(),
        }),
        500: z.object({
          sucesso: z.boolean(),
          mensagem: z.string(),
        }),
      },
    },
  }, async (req, reply) => {
    const { telefone, apiKey } = req.body;

    try {
      const usuario = await prisma.usuario.findUnique({
        where: {
          telefone: telefone
        }
      });

      if (!usuario) {
        return reply.status(404).send({
          sucesso: false,
          mensagem: 'Usuário não encontrado com este telefone.',
        });
      }

      if (apiKey !== process.env.API_KEY) {
         return reply.status(401).send({
           sucesso: false,
          mensagem: 'Credenciais inválidas.',
         });
      }

      const payload = {
        userId: usuario.id,
        telefone: usuario.telefone,
        login: usuario.login,
      };

      if (!JWT_SECRET) {
        throw new Error('JWT_SECRET não definida');
      }

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn:  1800 });

      return reply.status(200).send({
        sucesso: true,
        token: token,
        expiraEm: JWT_EXPIRES_IN,
        login: usuario.login
      });

    } catch (error) {
      console.error("Erro na rota /token:", error);
      return reply.status(500).send({
        sucesso: false,
        mensagem: "Erro interno ao gerar token. Tente novamente mais tarde!",
      });
    }
  });
    
  app.post('/turmas', {
    preHandler: [authenticateJWT],
    schema: {
      tags: ['Turmas'],
      description: 'Busca todas as turmas',
      body: z.object({
        senha: z.string(),
      }),
      security: [
        {
          bearerAuth: []
        }
      ],
      response: {
        200: z.object({
            sucesso: z.boolean(),
            turmas: z.array(z.string())
        }),
        404: z.object({
            sucesso: z.boolean(),
            mensagem: z.string()
        }),
        500: z.object({
            sucesso: z.boolean(),
            mensagem: z.string()
        })
      }
    }
  }, async (req, reply) => {

    const usuario = req.user;
    const senha = req.body.senha;

    if (!usuario) {
      return reply.status(401).send({
        sucesso: false,
        mensagem: 'Usuário não autenticado.',
      });
    }
  
    let turmas: string[] = [];
  
    try {
      const resultado = await buscarTurmas({
        login: usuario.login,
        password: senha,
      })
  
      if (!resultado.sucesso || !resultado.turmas) {
        return reply.status(404).send({
          sucesso: false,
          mensagem: resultado.mensagem || "Não foi possível obter as turmas para este usuário."
        });
      }
  
      turmas = resultado.turmas

      console.log("Turmas encontradas:", turmas);
      
    } catch (error) {
      console.error("Erro ao chamar a função buscarTurmas:", error);
      return reply.status(500).send({
        sucesso: false,
        mensagem: "Erro interno ao buscar turmas. Tente novamente mais tarde!"
      });
    }
  
    console.log("Busca por turmas concluida");

    return reply.status(200).send({
      sucesso: true,
      turmas
    })
      
  })
      
  app.post('/alunos', {
    preHandler: [authenticateJWT],
    schema: {
      tags: ['Alunos'],
      description: 'Busca todos os alunos',
      body: z.object({
        senha: z.string(),
        indiceTurma: z.string(),
      }),
      security: [
        {
          bearerAuth: []
        }
      ],
      response: {
        200: z.object({
          sucesso: z.boolean(),
          alunos: z.array(z.string())
        }),
        404: z.object({
          sucesso: z.boolean(),
          mensagem: z.string()
        }),
        500: z.object({
          sucesso: z.boolean(),
          mensagem: z.string()
        })
      }
    }
  }, async (req, reply) => {
    
    const { indiceTurma, senha } = req.body;
    
    const usuario = req.user;

    if (!usuario) {
      return reply.status(401).send({
        sucesso: false,
        mensagem: 'Usuário não autenticado.',
      });
    }
  
    let alunos: string[] = [];
    
    try {
      const resultado = await buscarAlunos({
        login: usuario.login,
        password: senha,
        indiceTurma: Number(indiceTurma)
      })
  
      if (!resultado.sucesso || !resultado.alunos) {
        return reply.status(404).send({
          sucesso: false,
          mensagem: resultado.mensagem
        });
      }
  
      alunos = resultado.alunos

      console.log("Alunos encontrados");
      
    } catch (error) {
      console.error("Erro ao chamar função buscarAlunos:", error);
      return reply.status(500).send({
        sucesso: false,
        mensagem: "Erro interno ao buscar alunos. Tente novamente mais tarde!"
      })
    }

    console.log("Busca por alunos concluida");
    
    return reply.status(200).send({
      sucesso: true,
      alunos
    })
      
  })
      
  app.post('/frequencia', {
    preHandler: [authenticateJWT],
    schema: {
      tags: ['Frequencia'],
      description: 'Marca frequencia',
      body: z.object({
        data: z.string(),
        alunosComFalta: z.string(),
        senha: z.string(),
      }),
      security: [
        {
          bearerAuth: []
        }
      ],
      response: {
        200: z.object({
          sucesso: z.boolean(),
          mensagem: z.string()
        }),
        400: z.object({
          sucesso: z.boolean(),
          mensagem: z.string()
        }),
        404: z.object({
          sucesso: z.boolean(),
          mensagem: z.string()
        }),
        500: z.object({
          sucesso: z.boolean(),
          mensagem: z.string()
        })
      }
    }
  }, async (req, reply) => {
        
    const { data, alunosComFalta, senha } = req.body;
    
    const usuario = req.user;

    if (!usuario) {
      return reply.status(401).send({
        sucesso: false,
        mensagem: 'Usuário não autenticado.',
      });
    }

    console.log(JSON.parse(alunosComFalta));

    if (!data || !alunosComFalta) {
      return reply.status(400).send({
        sucesso: false,
        mensagem: 'Data ou alunos com falta ausentes.',
      });
    }
      
    try {
  
      const resultado = await marcarFrequencia({
        alunosComFalta: JSON.parse(alunosComFalta),
        data,
        login: usuario.login,
        password: senha,
      })
  
      if (!resultado.sucesso) {
        return reply.status(404).send({
          sucesso: false,
          mensagem: resultado.mensagem
        });
      }

      console.log("Frequencia marcada com sucesso");
      
    } catch (error) {
      console.error("Erro ao chamar função marcarFrequencia:", error);
      return reply.status(500).send({
        sucesso: false,
        mensagem: "Erro interno ao marcar frequencia. Tente novamente mais tarde!"
      })
    }

    console.log("Frequencia marcada com sucesso");
    
      
    return reply.status(200).send({
      sucesso: true,
      mensagem: "Frequencia marcada com sucesso!"
    })
      
  })

  app.post('/aulas', {
    preHandler: [authenticateJWT],
    schema: {
      tags: ['Aulas'],
      description: 'Registra as aulas',
      body: z.object({
        senha: z.string(),
        linkCronograma: z.string(),
        bimestre: z.string(),
      }),
      security: [
        {
          bearerAuth: []
        }
      ],
      response: {
        200: z.object({
          sucesso: z.boolean(),
          mensagem: z.string()
        }),
        404: z.object({
          sucesso: z.boolean(),
          mensagem: z.string()
        }),
        500: z.object({
          sucesso: z.boolean(),
          mensagem: z.string()
        })
      }
    }
  }, async (req, reply) => {
        
    const { linkCronograma, bimestre, senha } = req.body;
    
    const usuario = req.user;

    if (!usuario) {
      return reply.status(401).send({
        sucesso: false,
        mensagem: 'Usuário não autenticado.',
      });
    }
      
    try {
  
      const resultado = await registrarAula({
        login: usuario.login,
        password: senha,
        linkCronograma,
        bimestre
      })
  
      if (!resultado.sucesso) {
        return reply.status(404).send({
          sucesso: false,
          mensagem: resultado.mensagem
        });
      }

      console.log("Aulas registradas com sucesso");
      
    } catch (error) {
      return reply.status(500).send({
        sucesso: false,
        mensagem: "Erro ao marcar frequencia. Tente novamente mais tarde!"
      })
    }

    console.log("Registro de aulas concluido com sucesso");
    
    return reply.status(200).send({
      sucesso: true,
      mensagem: "Registro de aulas concluído com sucesso!"
    })
      
  })

}