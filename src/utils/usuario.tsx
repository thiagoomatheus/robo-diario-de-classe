import { prisma } from "./prisma";

export async function buscarUsuario(telefone: string): Promise<{ id: string; login: string; senha: string; telefone: string }> {
  const usuario = await prisma.usuario.findUnique({
    where: {
      telefone: telefone
    }
  });

  if (!usuario || !usuario.login || !usuario.senha) {
    throw new Error('Usuário não encontrado ou incompleto.');
  }

  return usuario;
}