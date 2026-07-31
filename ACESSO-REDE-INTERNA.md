# SOPH.IA — acesso pela rede interna

## Na máquina que hospeda o sistema

1. Clique duas vezes em `INICIAR-SOPHIA-REDE.cmd`.
2. Mantenha abertas as janelas **SOPH.IA - Backend** e
   **SOPH.IA - Interface**.
3. O inicializador mostrará o endereço para acesso na rede, por exemplo:
   `http://192.168.1.20:5174`.

## No computador do estagiário

1. Estar conectado à mesma rede interna.
2. Abrir no Chrome ou Edge o endereço mostrado pelo inicializador.
3. Entrar com a conta individual criada pelo administrador.

Não compartilhe a senha de administrador. Cadastre o estagiário como usuário
do tipo **Padrão**, limitando-o às tarefas comuns do chat.

## Liberação do Firewall do Windows

Se o navegador do outro computador não abrir a página, execute uma única vez,
no PowerShell **como administrador**, na máquina que hospeda a SOPH.IA:

```powershell
New-NetFirewallRule -DisplayName "SOPH.IA - Rede interna" -Direction Inbound -Protocol TCP -LocalPort 5174 -Action Allow -Profile Domain,Private
```

Somente a porta da interface precisa ser liberada. A interface encaminha as
requisições da API internamente ao backend.

## Segurança

- Use somente na rede institucional autorizada.
- Não encaminhe portas no roteador e não exponha o endereço à internet.
- Não envie documentos sigilosos a provedores externos sem autorização.
- Reserve um IP fixo ou uma reserva DHCP para a máquina hospedeira.
