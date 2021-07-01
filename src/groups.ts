import { Snowflake } from "discord-api-types/v8";

export interface RoleGroup {
    readonly min: number | undefined;
    readonly max: number | undefined;
    readonly roles: GroupRole[];
    readonly requiredRole: Snowflake | undefined;

}

export interface GroupRole {
    readonly label: string;
    readonly emoji: Snowflake | undefined;
    readonly role: Snowflake;
}

export async function fetchGroup(guildId: Snowflake, index: number): Promise<RoleGroup> {
    return (await GROUPS.get(`${guildId}`, "json") as RoleGroup[])[index];
}