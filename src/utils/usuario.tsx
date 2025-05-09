import { prisma } from "./prisma";

export async function buscarUsuario(telefone: string): Promise<{ id: string; login: string; telefone: string }> {
  const usuario = await prisma.usuario.findUnique({
    where: {
      telefone: telefone
    }
  });

  if (!usuario || !usuario.login) {
    throw new Error('Usuário não encontrado ou incompleto.');
  }

  return usuario;
}