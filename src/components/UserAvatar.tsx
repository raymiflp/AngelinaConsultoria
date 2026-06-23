import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface UserAvatarProps {
  name?: string;
  image?: string | null;
}

/**
 * User avatar with image fallback to initials.
 *
 * Extracts initials from the `name` prop (first letter of first and last
 * name). Falls back to a generic user icon when no name is provided.
 */
export function UserAvatar({ name, image }: UserAvatarProps) {
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase() || "U"
    : "U";

  return (
    <Avatar className="size-8">
      {image && <AvatarImage src={image} alt={name ?? "Usuario"} />}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}
