import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    // Clean up existing data (optional, be careful in prod)
    // await prisma.message.deleteMany();
    // await prisma.match.deleteMany();
    // await prisma.swipe.deleteMany();
    // await prisma.user.deleteMany();

    const password = await bcrypt.hash('password123', 10);

    const users = [
        {
            phoneNumber: '+1111111111',
            password,
            name: 'Alice',
            age: 24,
            bio: 'Lover of hiking and coffee.',
            gender: 'female',
            images: ['https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400'],
            profilePhoto: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
            isVerified: true
        },
        {
            phoneNumber: '+2222222222',
            password,
            name: 'Bob',
            age: 28,
            bio: 'Tech enthusiast and gamer.',
            gender: 'male',
            images: ['https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400'],
            profilePhoto: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
            isVerified: true
        },
        {
            phoneNumber: '+3333333333',
            password,
            name: 'Charlie',
            age: 26,
            bio: 'Artist and traveler.',
            gender: 'non-binary',
            images: ['https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400'],
            profilePhoto: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
            isVerified: false
        },
        {
            phoneNumber: '+4444444444',
            password,
            name: 'Diana',
            age: 25,
            bio: 'Foodie.',
            gender: 'female',
            images: ['https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400'],
            profilePhoto: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400',
            isVerified: true
        }
    ];

    for (const user of users) {
        const existing = await prisma.user.findUnique({ where: { phoneNumber: user.phoneNumber } });
        if (!existing) {
            await prisma.user.create({ data: user });
            console.log(`Created user: ${user.name}`);
        } else {
            console.log(`User already exists: ${user.name}`);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
