import { APIInteractionResponse, APIInteraction, InteractionType, Routes, ComponentType, APISelectMenuComponent, InteractionResponseType, MessageFlags } from "discord-api-types/v9";
import { Snowflake } from "discord-api-types/globals";
import { verifyKey } from "discord-interactions";
import { fetchGroup } from "./groups";

export async function handleRequest(request: Request): Promise<Response> {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");

  const body = await request.text();

  if (!signature || !timestamp) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!verifyKey(body, signature, timestamp, publicKey)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const interaction = JSON.parse(body) as APIInteraction;

  if (interaction.type === InteractionType.Ping) {
    return respond({ type: InteractionResponseType.Pong });
  }

  if (interaction.type === InteractionType.MessageComponent) {
    // Ensure the interaction comes from a guild & has a custom ID
    if (!("custom_id" in interaction.data!) || !("guild_id" in interaction)) return new Response("", { status: 400 });
    const [operation, ...data] = interaction.data.custom_id.split(":");

    if (interaction.data.component_type === ComponentType.Button) {
      if (operation === "apply") {
        const id = data[0] as Snowflake;

        const adding = !interaction.member.roles.includes(id);
        await fetch("https://discord.com/api/v9" + Routes.guildMemberRole(interaction.guild_id, interaction.member.user.id, id), {
          headers: {
            Authorization: `Bot ${token}`
          },
          method: adding ? "PUT" : "DELETE"
        });

        return respond({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            flags: MessageFlags.Ephemeral,
            content: `${adding ? "Gave you" : "Removed"} the <@&${id}> role.`
          }
        });
      }

      if (operation !== "view") return new Response("", { status: 400 });

      const id = parseInt(data[0]);
      const group = await fetchGroup(interaction.guild_id, id);
    
      if (group.requiredRole && !interaction.member.roles.includes(group.requiredRole)) {
        return respond({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            flags: MessageFlags.Ephemeral,
            content: `<:error:839325739136712725> You must have the <@&${group.requiredRole}> role to open this category!`
          }
        });
      }

      const menu: APISelectMenuComponent = {
        type: ComponentType.SelectMenu,
        custom_id: `edit:${id}`,
        min_values: group.min || 0,
        max_values: group.max || group.roles.length,
        options: group.roles.map(data => {
          return {
            label: data.label,
            value: data.role,
            role: data.role,
            emoji: data.emoji ? { id: data.emoji, name: "typings are annoying" } : undefined, // TODO – Built-in emoji support
            default: interaction.member.roles.includes(data.role)
          }
        })
      }

      return respond({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          flags: MessageFlags.Ephemeral,
          content: "Select your desired roles:",
          //@ts-expect-error – The typings don't seem to allow for components in interaction responses for some reason...
          components: [{
            type: ComponentType.ActionRow,
            components: [menu]
          }]
        }
      });
    }

    if (interaction.data.component_type === ComponentType.SelectMenu) {
      if (operation !== "edit") return new Response("", { status: 400 });

      const group = await fetchGroup(interaction.guild_id, parseInt(data[0]));
      //@ts-expect-error
      const choices: Snowflake[] = interaction.data.values || [];

      const response = await fetch("https://discord.com/api/v9" + Routes.guildMember(interaction.guild_id, interaction.member.user.id), {
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json"
        },
        method: "PATCH",
        body: JSON.stringify({
          roles: Array.from(new Set([
            ...interaction.member.roles.filter(id => !group.roles.some(r => r.role === id) || choices.includes(id)),
            ...choices
          ]))
        })
      });

      switch (response.status) {
        case 200: case 204: 
          return respond({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              flags: MessageFlags.Ephemeral,
              content: "<:saved:553825818384531456> Saved your changes! You can now go back and select different roles if you wish."
            }
          });
        case 403:
          return respond({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              flags: MessageFlags.Ephemeral,
              content: "<:error:839325739136712725> I don't seem to have permissions to make these changes."
            }
          });
        case 429:
          return respond({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              flags: MessageFlags.Ephemeral,
              content: "<:error:839325739136712725> I seem to be getting rate limited, please try again later."
            }
          });
        default:
          return respond({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              flags: MessageFlags.Ephemeral,
              content: `<:error:839325739136712725> An unknown error occurred (${response.status} ${response.statusText})`
            }
          });
      }
    }
  }

  return new Response("Unknown interaction", { status: 400 });
}

function respond(response: APIInteractionResponse): Response {
  return new Response(JSON.stringify(response), {
    headers: {
      "Content-Type": "application/json"
    },
    status: 200
  });
}