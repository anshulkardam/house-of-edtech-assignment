import prisma from "@/lib/prisma";

const Home = async () => {
  const users = await prisma.user.findMany();
  return (
    <div>
      <h1>got your users right here fam!</h1>

      {users.map((u) => (
        <div key={u.id}>{u.name}</div>
      ))}
    </div>
  );
};

export default Home;
