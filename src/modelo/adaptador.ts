/**
 * The whole model boundary.
 *
 * One method, on purpose: everything this harness is about happens before and
 * after the call, and a wide interface would invite the harness to grow into a
 * gateway. A real provider is a file that implements this and nothing else.
 */
export interface EntradaDeModelo {
  /** The agent's instruction — the body of its file. */
  instrucao: string;
  /** What the caller asked for. */
  pedido: string;
}

export interface ModeloAdapter {
  responder(entrada: EntradaDeModelo): Promise<string>;
}
