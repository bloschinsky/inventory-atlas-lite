// LIKE helpers shared by the repositories. Every LIKE in this project uses ESCAPE '\'.
export const escapeLike = value => value.replace(/[\\%_]/g, '\\$&');
export const containsLike = value => `%${escapeLike(value)}%`;
export const startsWithLike = value => `${escapeLike(value)}%`;
