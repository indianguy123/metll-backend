import { Response } from 'express';
import prisma from '../config/database.config';
import { AuthRequest } from '../types';
import { getSocketIO } from '../config/socket.config';

// Question pools for different stages - More engaging and fun!
const ICE_BREAKER_QUESTIONS = [
    "What's the most spontaneous thing you've done recently? 🌟",
    "If you could have dinner with anyone (dead or alive), who would it be? 🍽️",
    "What's a song that instantly puts you in a good mood? 🎵",
    "What's your go-to comfort food when you need a pick-me-up? 🍕",
    "What's something you're secretly really good at? 😎",
    "If you could travel anywhere right now, where would you go? ✈️",
    "What's the best piece of advice you've ever received? 💡",
    "What's a small thing that always makes your day better? ☀️",
    "What's your ideal way to spend a lazy Sunday? 🛋️",
    "What's something you're curious about but haven't tried yet? 🤔",
];

const THIS_OR_THAT_QUESTIONS = [
    {
        question: "Texting or calling? 📱",
        options: ["Texting", "Calling"],
        followUp: "Interesting choice! Some people love the convenience of texting, others prefer hearing someone's voice."
    },
    {
        question: "Early mornings or late nights? 🌙",
        options: ["Early mornings", "Late nights"],
        followUp: "Nice! Early birds catch the worm, but night owls catch the stars ✨"
    },
    {
        question: "Street food or fancy restaurants? 🍜",
        options: ["Street food", "Fancy restaurants"],
        followUp: "Both have their charm! Street food for adventure, restaurants for special moments."
    },
    {
        question: "Adventure or comfort zone? 🎢",
        options: ["Adventure", "Comfort zone"],
        followUp: "Balance is key! Sometimes we need adventure, sometimes we need our cozy space."
    },
    {
        question: "Movies or books? 🎬",
        options: ["Movies", "Books"],
        followUp: "Great choice! Movies bring stories to life, books let your imagination run wild."
    },
    {
        question: "Beach vacation or mountain retreat? 🏔️",
        options: ["Beach vacation", "Mountain retreat"],
        followUp: "Perfect! Beaches for relaxation, mountains for reflection."
    },
    {
        question: "Coffee or tea? ☕",
        options: ["Coffee", "Tea"],
        followUp: "Both are amazing! Coffee for energy, tea for calm."
    },
    {
        question: "Dogs or cats? 🐕",
        options: ["Dogs", "Cats"],
        followUp: "Aww! Both are adorable. Dogs are loyal friends, cats are independent spirits."
    },
];

// DEEP_QUESTIONS - Reserved for future use in deeper conversation stages
// const DEEP_QUESTIONS = [
//     "What's a quality in someone that instantly draws you to them? 💫",
//     "What makes you feel most authentically yourself? 🌟",
//     "What's something you value deeply in relationships? ❤️",
//     "How do you recharge when life gets overwhelming? 🧘",
//     "What's a lesson you've learned that changed how you see things? 📚",
//     "What kind of energy do you bring to the people around you? ⚡",
// ];

// NEW MINI-GAMES! 🎮

// Emoji Story Game - Guess the movie/show
const EMOJI_STORY_GAMES = [
    {
        emojis: "👸❄️⛄️👧",
        answer: "Frozen",
        hint: "Let it go! ❄️",
        gameType: "emoji_story"
    },
    {
        emojis: "🦁👑🌅",
        answer: "The Lion King",
        hint: "Circle of life 🎵",
        gameType: "emoji_story"
    },
    {
        emojis: "🕷️🦸‍♂️🏙️",
        answer: "Spider-Man",
        hint: "With great power...",
        gameType: "emoji_story"
    },
    {
        emojis: "💍🧙‍♂️🌋",
        answer: "Lord of the Rings",
        hint: "One ring to rule them all",
        gameType: "emoji_story"
    },
    {
        emojis: "🚢❤️💎🥶",
        answer: "Titanic",
        hint: "I'm the king of the world!",
        gameType: "emoji_story"
    },
];

// Rate 1-10 Game
const RATE_QUESTIONS = [
    { question: "Rate your love for spicy food 🌶️", scale: "1 (mild) to 10 (ghost pepper)", gameType: "rate_scale" },
    { question: "Rate how much of a night owl you are 🦉", scale: "1 (early bird) to 10 (vampire)", gameType: "rate_scale" },
    { question: "Rate your dance floor confidence 💃", scale: "1 (wallflower) to 10 (star)", gameType: "rate_scale" },
    { question: "Rate your cooking skills 👨‍🍳", scale: "1 (burnt toast) to 10 (chef level)", gameType: "rate_scale" },
    { question: "Rate your spontaneity level ⚡", scale: "1 (planner) to 10 (do it now!)", gameType: "rate_scale" },
];

// Would You Rather Game
const WOULD_YOU_RATHER = [
    {
        question: "Would you rather...",
        options: ["Have the power to read minds 🧠", "Have the power to fly ✈️"],
        followUp: "Both are amazing superpowers! Mind reading for connection, flying for freedom.",
        gameType: "would_you_rather"
    },
    {
        question: "Would you rather...",
        options: ["Only eat pizza forever 🍕", "Only eat ice cream forever 🍦"],
        followUp: "The eternal food debate! Both are comfort food champions.",
        gameType: "would_you_rather"
    },
    {
        question: "Would you rather...",
        options: ["Live in a treehouse 🌳", "Live in a beach house 🏖️"],
        followUp: "Nature lovers unite! Both sound like dream escapes.",
        gameType: "would_you_rather"
    },
    {
        question: "Would you rather...",
        options: ["Know all languages 🌍", "Play all instruments 🎸"],
        followUp: "Such creative choices! Both open doors to beautiful connections.",
        gameType: "would_you_rather"
    },
];

// Quick Fire Round - rapid fun questions
const QUICK_FIRE_QUESTIONS = [
    { question: "Pineapple on pizza? 🍍🍕", options: ["Yes! 🙌", "Never! 🙅"], gameType: "quick_fire" },
    { question: "Toilet paper: over or under? 🧻", options: ["Over ⬆️", "Under ⬇️"], gameType: "quick_fire" },
    { question: "Socks with sandals? 🧦👡", options: ["Comfy! 😌", "Fashion crime! 👮"], gameType: "quick_fire" },
    { question: "GIF pronunciation? 🖼️", options: ["Gif (hard G)", "Jif (soft G)"], gameType: "quick_fire" },
    { question: "Hotdog: sandwich? 🌭", options: ["Yes, it is!", "Absolutely not!"], gameType: "quick_fire" },
];

// Two Truths One Lie - prompts for users
const TWO_TRUTHS_PROMPTS = [
    "Share 2 truths and 1 lie about your hobbies! Let the other person guess which is the lie 🎭",
    "Share 2 truths and 1 lie about places you've been! 🗺️",
    "Share 2 truths and 1 lie about your food preferences! 🍽️",
    "Share 2 truths and 1 lie about your childhood! 👶",
];

// Compatibility Quiz - Reserved for future use
// const COMPATIBILITY_QUESTIONS = [
//     {
//         question: "Pick your ideal date night:",
//         options: ["Cozy movie night in 🎬", "Adventure outdoors 🏕️", "Fancy dinner out 🍷", "Game night with friends 🎲"],
//         gameType: "compatibility"
//     },
//     {
//         question: "Your love language is:",
//         options: ["Words 💌", "Touch 🤗", "Gifts 🎁", "Quality time ⏰", "Acts of service 🛠️"],
//         gameType: "compatibility"
//     },
// ];

/**
 * Get or create AI host session for a match
 * GET /api/host/:matchId
 */
export const getHostSession = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const matchId = parseInt(req.params.matchId);
        if (isNaN(matchId)) {
            res.status(400).json({ success: false, message: 'Invalid match ID.' });
            return;
        }

        // Verify user is part of this match
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { chatRoom: { include: { hostSession: { include: { messages: { orderBy: { createdAt: 'asc' } } } } } } },
        });

        if (!match) {
            res.status(404).json({ success: false, message: 'Match not found.' });
            return;
        }

        if (match.user1Id !== userId && match.user2Id !== userId) {
            res.status(403).json({ success: false, message: 'Access denied.' });
            return;
        }

        if (!match.chatRoom) {
            res.status(400).json({ success: false, message: 'Chat room not found.' });
            return;
        }

        // Get or create session
        let session = match.chatRoom.hostSession;

        if (!session) {
            session = await prisma.chatHostSession.create({
                data: {
                    chatRoomId: match.chatRoom.id,
                    matchId: match.id,
                    status: 'pending',
                    currentStage: 'STAGE_0',
                },
                include: { messages: { orderBy: { createdAt: 'asc' } } },
            });
        }

        res.status(200).json({
            success: true,
            data: {
                ...session,
                currentUserId: userId,
                isUser1: match.user1Id === userId,
            },
        });
    } catch (error: any) {
        console.error('Get host session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get host session.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Opt-in to AI host
 * POST /api/host/:matchId/opt-in
 */
export const optInToHost = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const matchId = parseInt(req.params.matchId);
        if (isNaN(matchId)) {
            res.status(400).json({ success: false, message: 'Invalid match ID.' });
            return;
        }

        // Verify user is part of this match
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { chatRoom: { include: { hostSession: true } } },
        });

        if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
            res.status(403).json({ success: false, message: 'Access denied.' });
            return;
        }

        if (!match.chatRoom) {
            res.status(400).json({ success: false, message: 'Chat room not found.' });
            return;
        }

        // Get or create session
        let session = match.chatRoom.hostSession;
        if (!session) {
            session = await prisma.chatHostSession.create({
                data: {
                    chatRoomId: match.chatRoom.id,
                    matchId: match.id,
                    status: 'pending',
                    currentStage: 'STAGE_0',
                },
            });
        }

        // If session was exited, reset it to allow re-entry
        const isUser1 = match.user1Id === userId;
        let updateData: any;

        if (session.status === 'exited') {
            // Reset session for re-entry
            updateData = {
                status: 'pending',
                currentStage: 'STAGE_0',
                user1OptIn: false,
                user2OptIn: false,
                stageData: null,
                startedAt: null,
                completedAt: null,
            };
            // Set current user's opt-in
            if (isUser1) {
                updateData.user1OptIn = true;
            } else {
                updateData.user2OptIn = true;
            }
        } else {
            // Normal opt-in
            updateData = isUser1
                ? { user1OptIn: true }
                : { user2OptIn: true };
        }

        const updatedSession = await prisma.chatHostSession.update({
            where: { id: session.id },
            data: updateData,
        });

        // Check if both users have opted in (and status is pending)
        if (updatedSession.user1OptIn && updatedSession.user2OptIn && updatedSession.status === 'pending') {
            // Start the host session - STAGE 1
            await startHostSession(updatedSession.id, matchId);
        }

        // Emit socket event
        const io = getSocketIO();
        if (io) {
            io.to(`chat:${match.chatRoom.id}`).emit('host_opt_in', {
                sessionId: updatedSession.id,
                userId,
                bothOptedIn: updatedSession.user1OptIn && updatedSession.user2OptIn,
            });
        }

        const matchForOptIn = await prisma.match.findUnique({
            where: { id: matchId },
        });

        res.status(200).json({
            success: true,
            data: {
                ...updatedSession,
                currentUserId: userId,
                isUser1: matchForOptIn?.user1Id === userId,
            },
        });
    } catch (error: any) {
        console.error('Opt-in error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to opt-in.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

/**
 * Decline AI host
 * POST /api/host/:matchId/opt-out
 */
export const optOutOfHost = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const matchId = parseInt(req.params.matchId);
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { chatRoom: { include: { hostSession: true } } },
        });

        if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
            res.status(403).json({ success: false, message: 'Access denied.' });
            return;
        }

        if (match.chatRoom?.hostSession) {
            const isUser1 = match.user1Id === userId;
            const updateData = isUser1
                ? { user1OptIn: false }
                : { user2OptIn: false };

            await prisma.chatHostSession.update({
                where: { id: match.chatRoom.hostSession.id },
                data: { ...updateData, status: 'declined' },
            });
        }

        res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('Opt-out error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to opt-out.',
        });
    }
};

/**
 * Submit answer to host question
 * POST /api/host/:matchId/answer
 */
export const submitHostAnswer = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const matchId = parseInt(req.params.matchId);
        const { answer, questionId } = req.body;

        if (!answer) {
            res.status(400).json({ success: false, message: 'Answer is required.' });
            return;
        }

        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { chatRoom: { include: { hostSession: { include: { messages: true } } } } },
        });

        if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
            res.status(403).json({ success: false, message: 'Access denied.' });
            return;
        }

        const session = match.chatRoom?.hostSession;
        if (!session || session.status !== 'active') {
            res.status(400).json({ success: false, message: 'Host session not active.' });
            return;
        }

        const isUser1 = match.user1Id === userId;
        const senderType = isUser1 ? 'user1' : 'user2';

        // Save user answer
        const userAnswerMessage = await prisma.chatHostMessage.create({
            data: {
                sessionId: session.id,
                senderType,
                senderId: userId,
                content: answer,
                messageType: 'text',
            },
        });

        // Immediately broadcast the user's answer to both users in the chat
        const io = getSocketIO();
        if (io && match.chatRoom) {
            io.to(`chat:${match.chatRoom.id}`).emit('host_message', {
                message: {
                    id: userAnswerMessage.id,
                    senderType: senderType,
                    senderId: userId,
                    content: userAnswerMessage.content,
                    messageType: userAnswerMessage.messageType,
                    metadata: null,
                    createdAt: userAnswerMessage.createdAt,
                },
                sessionId: session.id,
            });
        }

        // Update stage data
        const stageData = (session.stageData as any) || {};
        const answers = stageData.answers || {};
        const answerKey = questionId || `q_${Date.now()}`;
        answers[answerKey] = { userId, answer, timestamp: new Date().toISOString() };
        stageData.answers = answers;

        await prisma.chatHostSession.update({
            where: { id: session.id },
            data: { stageData },
        });

        // Send a quick acknowledgment (non-blocking)
        // Note: io is already defined above
        if (io && match.chatRoom) {
            const reactions = [
                "Nice! 👍",
                "Love it! 💫",
                "Great answer! ✨",
                "Interesting! 🤔",
                "Cool! 😎",
            ];
            const reaction = reactions[Math.floor(Math.random() * reactions.length)];

            // Send a quick reaction message
            setTimeout(async () => {
                const reactionMessage = await prisma.chatHostMessage.create({
                    data: {
                        sessionId: session.id,
                        senderType: 'host',
                        content: reaction,
                        messageType: 'text',
                        metadata: { stage: session.currentStage, isReaction: true },
                    },
                });

                io.to(`chat:${match.chatRoom!.id}`).emit('host_message', {
                    message: {
                        id: reactionMessage.id,
                        senderType: 'host',
                        content: reactionMessage.content,
                        messageType: reactionMessage.messageType,
                        metadata: reactionMessage.metadata,
                        createdAt: reactionMessage.createdAt,
                    },
                    sessionId: session.id,
                });
            }, 500);
        }

        // Process next step based on stage
        await processNextHostStep(session.id, matchId, match.chatRoom!.id);

        // Emit socket event (reuse io from above)
        if (io && match.chatRoom) {
            io.to(`chat:${match.chatRoom.id}`).emit('host_answer', {
                sessionId: session.id,
                userId,
                answer,
            });
        }

        res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('Submit answer error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit answer.',
        });
    }
};

/**
 * Start host session (internal function)
 */
async function startHostSession(sessionId: number, matchId: number): Promise<void> {
    const session = await prisma.chatHostSession.findUnique({
        where: { id: sessionId },
        include: { messages: true },
    });

    if (!session) return;

    // Update status and stage
    await prisma.chatHostSession.update({
        where: { id: sessionId },
        data: {
            status: 'active',
            currentStage: 'STAGE_1',
            startedAt: new Date(),
        },
    });

    // Send STAGE 1 message (Ice-breaker)
    const question = ICE_BREAKER_QUESTIONS[Math.floor(Math.random() * ICE_BREAKER_QUESTIONS.length)];

    const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { chatRoom: true },
    });

    if (!match?.chatRoom) return;

    const hostMessage = await prisma.chatHostMessage.create({
        data: {
            sessionId,
            senderType: 'host',
            content: `Hey! 👋 I'm here to help you both get to know each other better. Let's start with something fun!\n\n${question}\n\nTake your time - no pressure! 😊`,
            messageType: 'question',
            metadata: { stage: 'STAGE_1', question, questionType: 'ice_breaker' },
        },
    });

    // Emit to both users
    const io = getSocketIO();
    if (io) {
        io.to(`chat:${match.chatRoom.id}`).emit('host_message', {
            message: {
                id: hostMessage.id,
                senderType: 'host',
                content: hostMessage.content,
                messageType: hostMessage.messageType,
                metadata: hostMessage.metadata,
                createdAt: hostMessage.createdAt,
            },
            sessionId,
        });
    }
}

/**
 * Process next host step based on current stage
 */
async function processNextHostStep(sessionId: number, matchId: number, chatRoomId: number): Promise<void> {
    const session = await prisma.chatHostSession.findUnique({
        where: { id: sessionId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!session) return;

    const stage = session.currentStage;
    const stageData = (session.stageData as any) || {};
    const answers = stageData.answers || {};

    const match = await prisma.match.findUnique({
        where: { id: matchId },
    });

    if (!match) return;

    // Count user answers for current question
    const user1Answers = Object.values(answers).filter((a: any) => a.userId === match.user1Id);
    const user2Answers = Object.values(answers).filter((a: any) => a.userId === match.user2Id);

    if (stage === 'STAGE_1') {
        // Ice-breaker: wait for both users to answer
        if (user1Answers.length === 1 && user2Answers.length === 1) {
            // Move to STAGE 2: Mini Game
            await prisma.chatHostSession.update({
                where: { id: sessionId },
                data: { currentStage: 'STAGE_2' },
            });

            const gameQuestion = THIS_OR_THAT_QUESTIONS[0];
            const hostMessage = await prisma.chatHostMessage.create({
                data: {
                    sessionId,
                    senderType: 'host',
                    content: `Great answers! 🎉 Now let's play a quick game - "This or That"!\n\n${gameQuestion.question}\n\nJust pick one - go with your gut! ⚡`,
                    messageType: 'game_prompt',
                    metadata: {
                        stage: 'STAGE_2',
                        gameType: 'this_or_that',
                        options: gameQuestion.options,
                        questionId: `q_${Date.now()}`,
                        followUp: gameQuestion.followUp
                    },
                },
            });

            const io = getSocketIO();
            if (io) {
                io.to(`chat:${chatRoomId}`).emit('host_message', {
                    message: {
                        id: hostMessage.id,
                        senderType: 'host',
                        content: hostMessage.content,
                        messageType: hostMessage.messageType,
                        metadata: hostMessage.metadata,
                        createdAt: hostMessage.createdAt,
                    },
                    sessionId,
                });
            }

            // Reset answers for next stage
            await prisma.chatHostSession.update({
                where: { id: sessionId },
                data: { stageData: {} },
            });
        }
    } else if (stage === 'STAGE_2') {
        // Mini game: count rounds (answers are reset per round, so count all current answers)
        const gameRounds = stageData.gameRounds || 0;
        const currentRoundAnswers = Object.keys(answers).length;

        // Check if both users have answered the current round
        // After reset, we start counting from 0, so if currentRoundAnswers === 2, both answered
        if (currentRoundAnswers >= 2) {
            // Get the current question to show follow-up
            const currentRoundIndex = gameRounds;
            const currentQuestion = THIS_OR_THAT_QUESTIONS[currentRoundIndex];

            // Send a fun comment about their answers
            if (currentQuestion?.followUp) {
                const commentMessage = await prisma.chatHostMessage.create({
                    data: {
                        sessionId,
                        senderType: 'host',
                        content: currentQuestion.followUp,
                        messageType: 'text',
                        metadata: { stage: 'STAGE_2', isComment: true },
                    },
                });

                const io = getSocketIO();
                if (io) {
                    io.to(`chat:${chatRoomId}`).emit('host_message', {
                        message: {
                            id: commentMessage.id,
                            senderType: 'host',
                            content: commentMessage.content,
                            messageType: commentMessage.messageType,
                            metadata: commentMessage.metadata,
                            createdAt: commentMessage.createdAt,
                        },
                        sessionId,
                    });
                }
            }

            if (gameRounds < 2) {
                // Move to next question
                const nextRoundIndex = gameRounds + 1;
                const nextQuestion = THIS_OR_THAT_QUESTIONS[nextRoundIndex];

                if (nextQuestion) {
                    // Reset answers for next round and increment gameRounds
                    await prisma.chatHostSession.update({
                        where: { id: sessionId },
                        data: {
                            stageData: {
                                gameRounds: nextRoundIndex,
                                answers: {}, // Reset for next round
                            }
                        },
                    });

                    // Small delay before next question
                    setTimeout(async () => {
                        const hostMessage = await prisma.chatHostMessage.create({
                            data: {
                                sessionId,
                                senderType: 'host',
                                content: `Next one! 🎯\n\n${nextQuestion.question}`,
                                messageType: 'game_prompt',
                                metadata: {
                                    stage: 'STAGE_2',
                                    gameType: 'this_or_that',
                                    options: nextQuestion.options,
                                    round: nextRoundIndex,
                                    questionId: `q_${Date.now()}`,
                                    followUp: nextQuestion.followUp
                                },
                            },
                        });

                        const io = getSocketIO();
                        if (io) {
                            io.to(`chat:${chatRoomId}`).emit('host_message', {
                                message: {
                                    id: hostMessage.id,
                                    senderType: 'host',
                                    content: hostMessage.content,
                                    messageType: hostMessage.messageType,
                                    metadata: hostMessage.metadata,
                                    createdAt: hostMessage.createdAt,
                                },
                                sessionId,
                            });
                        }
                    }, 2000); // 2 second delay
                } else {
                    // No more questions, move to STAGE 3
                    await moveToStage3(sessionId, chatRoomId);
                }
            } else {
                // Completed all rounds, move to STAGE 3 (Emoji Story)
                await moveToStage3(sessionId, chatRoomId);
            }
        }
    } else if (stage === 'STAGE_3') {
        // Emoji Story Game - wait for both users to guess
        const answerCount = Object.keys(answers).length;
        if (answerCount >= 2) {
            // Both guessed! Give the answer and move on
            const lastHostMessage = await prisma.chatHostMessage.findFirst({
                where: { sessionId, senderType: 'host', messageType: 'game_prompt' },
                orderBy: { createdAt: 'desc' }
            });
            const correctAnswer = (lastHostMessage?.metadata as any)?.answer || 'Unknown';

            const revealMessage = await prisma.chatHostMessage.create({
                data: {
                    sessionId,
                    senderType: 'host',
                    content: `🎬 The answer was: ${correctAnswer}! Great guesses! 🏆`,
                    messageType: 'text',
                    metadata: { stage: 'STAGE_3', isReveal: true },
                },
            });

            const io = getSocketIO();
            if (io) {
                io.to(`chat:${chatRoomId}`).emit('host_message', {
                    message: {
                        id: revealMessage.id,
                        senderType: 'host',
                        content: revealMessage.content,
                        messageType: revealMessage.messageType,
                        metadata: revealMessage.metadata,
                        createdAt: revealMessage.createdAt,
                    },
                    sessionId,
                });
            }

            // Move to Quick Fire Round after a delay
            setTimeout(async () => {
                await moveToQuickFire(sessionId, chatRoomId);
            }, 2000);
        }
    } else if (stage === 'STAGE_4') {
        // Quick Fire Round
        const gameRounds = stageData.gameRounds || 0;
        const answerCount = Object.keys(answers).length;

        if (answerCount >= 2) {
            if (gameRounds < 2) {
                // Next Quick Fire question
                const nextRound = gameRounds + 1;
                const nextQuestion = QUICK_FIRE_QUESTIONS[nextRound];

                await prisma.chatHostSession.update({
                    where: { id: sessionId },
                    data: { stageData: { gameRounds: nextRound, answers: {} } },
                });

                setTimeout(async () => {
                    const hostMessage = await prisma.chatHostMessage.create({
                        data: {
                            sessionId,
                            senderType: 'host',
                            content: `⚡ ${nextQuestion.question}`,
                            messageType: 'game_prompt',
                            metadata: {
                                stage: 'STAGE_4',
                                gameType: 'quick_fire',
                                options: nextQuestion.options,
                                questionId: `quick_${Date.now()}`
                            },
                        },
                    });

                    const io = getSocketIO();
                    if (io) {
                        io.to(`chat:${chatRoomId}`).emit('host_message', {
                            message: {
                                id: hostMessage.id,
                                senderType: 'host',
                                content: hostMessage.content,
                                messageType: hostMessage.messageType,
                                metadata: hostMessage.metadata,
                                createdAt: hostMessage.createdAt,
                            },
                            sessionId,
                        });
                    }
                }, 1500);
            } else {
                // Done with Quick Fire, move to Would You Rather
                await moveToWouldYouRather(sessionId, chatRoomId);
            }
        }
    } else if (stage === 'STAGE_4B') {
        // Would You Rather - after both answer, move to Rate Scale
        const answerCount = Object.keys(answers).length;
        if (answerCount >= 2) {
            // Check if answers match!
            const answerValues = Object.values(answers).map((a: any) => a.answer);
            const match = answerValues[0] === answerValues[1];

            const reactionMessage = match
                ? "🎉 You both picked the same! That's some serious compatibility vibes! ✨"
                : "😄 Different picks! That's what makes things interesting - variety is the spice of life!";

            const reaction = await prisma.chatHostMessage.create({
                data: {
                    sessionId,
                    senderType: 'host',
                    content: reactionMessage,
                    messageType: 'text',
                    metadata: { stage: 'STAGE_4B', isReaction: true, matched: match },
                },
            });

            const io = getSocketIO();
            if (io) {
                io.to(`chat:${chatRoomId}`).emit('host_message', {
                    message: {
                        id: reaction.id,
                        senderType: 'host',
                        content: reaction.content,
                        messageType: reaction.messageType,
                        metadata: reaction.metadata,
                        createdAt: reaction.createdAt,
                    },
                    sessionId,
                });
            }

            // Move to Rate Scale
            setTimeout(async () => {
                await moveToRateScale(sessionId, chatRoomId);
            }, 2500);
        }
    } else if (stage === 'STAGE_4C') {
        // Rate Scale - after both rate, compare and move to Two Truths
        const answerCount = Object.keys(answers).length;
        if (answerCount >= 2) {
            const answerValues = Object.values(answers).map((a: any) => a.answer);
            const rating1 = parseInt(answerValues[0]) || 5;
            const rating2 = parseInt(answerValues[1]) || 5;
            const diff = Math.abs(rating1 - rating2);

            let reactionMessage = "";
            if (diff <= 1) {
                reactionMessage = `🎯 Wow, you're on the same wavelength! Both around ${Math.round((rating1 + rating2) / 2)}/10!`;
            } else if (diff <= 3) {
                reactionMessage = `📊 Pretty close! ${rating1}/10 vs ${rating2}/10 - not too different!`;
            } else {
                reactionMessage = `😂 Opposites attract? ${rating1}/10 vs ${rating2}/10 - that's quite the difference!`;
            }

            const reaction = await prisma.chatHostMessage.create({
                data: {
                    sessionId,
                    senderType: 'host',
                    content: reactionMessage,
                    messageType: 'text',
                    metadata: { stage: 'STAGE_4C', isReaction: true },
                },
            });

            const io = getSocketIO();
            if (io) {
                io.to(`chat:${chatRoomId}`).emit('host_message', {
                    message: {
                        id: reaction.id,
                        senderType: 'host',
                        content: reaction.content,
                        messageType: reaction.messageType,
                        metadata: reaction.metadata,
                        createdAt: reaction.createdAt,
                    },
                    sessionId,
                });
            }

            // Move to Two Truths One Lie (final game before handoff)
            setTimeout(async () => {
                await moveToTwoTruths(sessionId, chatRoomId);
            }, 2500);
        }
    }
    // STAGE_4D (Two Truths) handles its own timeout to handoff
}

/**
 * Move to STAGE 3: Emoji Story Game! 🎬
 */
async function moveToStage3(sessionId: number, chatRoomId: number): Promise<void> {
    await prisma.chatHostSession.update({
        where: { id: sessionId },
        data: { currentStage: 'STAGE_3', stageData: { gameRounds: 0, answers: {} } },
    });

    const emojiGame = EMOJI_STORY_GAMES[Math.floor(Math.random() * EMOJI_STORY_GAMES.length)];

    const hostMessage = await prisma.chatHostMessage.create({
        data: {
            sessionId,
            senderType: 'host',
            content: `🎬 Time for a fun challenge!\n\nCan you guess this movie from the emojis?\n\n${emojiGame.emojis}\n\nType your guess below! First one to get it wins bragging rights 🏆`,
            messageType: 'game_prompt',
            metadata: {
                stage: 'STAGE_3',
                gameType: 'emoji_story',
                answer: emojiGame.answer,
                hint: emojiGame.hint,
                questionId: `emoji_${Date.now()}`
            },
        },
    });

    const io = getSocketIO();
    if (io) {
        io.to(`chat:${chatRoomId}`).emit('host_message', {
            message: {
                id: hostMessage.id,
                senderType: 'host',
                content: hostMessage.content,
                messageType: hostMessage.messageType,
                metadata: hostMessage.metadata,
                createdAt: hostMessage.createdAt,
            },
            sessionId,
        });
    }

    // After both answer, move to Stage 4 (handled in processNextHostStep)
}

/**
 * Move to STAGE 4: Quick Fire Round! ⚡
 */
async function moveToQuickFire(sessionId: number, chatRoomId: number): Promise<void> {
    await prisma.chatHostSession.update({
        where: { id: sessionId },
        data: { currentStage: 'STAGE_4', stageData: { gameRounds: 0, answers: {} } },
    });

    const quickQuestion = QUICK_FIRE_QUESTIONS[0];

    const hostMessage = await prisma.chatHostMessage.create({
        data: {
            sessionId,
            senderType: 'host',
            content: `⚡ QUICK FIRE ROUND! ⚡\n\nNo thinking, just gut reactions!\n\n${quickQuestion.question}`,
            messageType: 'game_prompt',
            metadata: {
                stage: 'STAGE_4',
                gameType: 'quick_fire',
                options: quickQuestion.options,
                questionId: `quick_${Date.now()}`
            },
        },
    });

    const io = getSocketIO();
    if (io) {
        io.to(`chat:${chatRoomId}`).emit('host_message', {
            message: {
                id: hostMessage.id,
                senderType: 'host',
                content: hostMessage.content,
                messageType: hostMessage.messageType,
                metadata: hostMessage.metadata,
                createdAt: hostMessage.createdAt,
            },
            sessionId,
        });
    }
}

/**
 * Move to STAGE 4B: Would You Rather! 🤔
 */
async function moveToWouldYouRather(sessionId: number, chatRoomId: number): Promise<void> {
    await prisma.chatHostSession.update({
        where: { id: sessionId },
        data: { currentStage: 'STAGE_4B', stageData: { gameRounds: 0, answers: {} } },
    });

    const wyrQuestion = WOULD_YOU_RATHER[Math.floor(Math.random() * WOULD_YOU_RATHER.length)];

    const hostMessage = await prisma.chatHostMessage.create({
        data: {
            sessionId,
            senderType: 'host',
            content: `🤔 ${wyrQuestion.question}\n\nThis one's juicy - take your pick!`,
            messageType: 'game_prompt',
            metadata: {
                stage: 'STAGE_4B',
                gameType: 'would_you_rather',
                options: wyrQuestion.options,
                followUp: wyrQuestion.followUp,
                questionId: `wyr_${Date.now()}`
            },
        },
    });

    const io = getSocketIO();
    if (io) {
        io.to(`chat:${chatRoomId}`).emit('host_message', {
            message: {
                id: hostMessage.id,
                senderType: 'host',
                content: hostMessage.content,
                messageType: hostMessage.messageType,
                metadata: hostMessage.metadata,
                createdAt: hostMessage.createdAt,
            },
            sessionId,
        });
    }
}

/**
 * Move to STAGE 4C: Rate Scale Fun! 📊
 */
async function moveToRateScale(sessionId: number, chatRoomId: number): Promise<void> {
    await prisma.chatHostSession.update({
        where: { id: sessionId },
        data: { currentStage: 'STAGE_4C', stageData: { gameRounds: 0, answers: {} } },
    });

    const rateQuestion = RATE_QUESTIONS[Math.floor(Math.random() * RATE_QUESTIONS.length)];

    const hostMessage = await prisma.chatHostMessage.create({
        data: {
            sessionId,
            senderType: 'host',
            content: `📊 Rate yourself!\n\n${rateQuestion.question}\n\n(${rateQuestion.scale})\n\nJust type a number 1-10!`,
            messageType: 'game_prompt',
            metadata: {
                stage: 'STAGE_4C',
                gameType: 'rate_scale',
                scale: rateQuestion.scale,
                questionId: `rate_${Date.now()}`
            },
        },
    });

    const io = getSocketIO();
    if (io) {
        io.to(`chat:${chatRoomId}`).emit('host_message', {
            message: {
                id: hostMessage.id,
                senderType: 'host',
                content: hostMessage.content,
                messageType: hostMessage.messageType,
                metadata: hostMessage.metadata,
                createdAt: hostMessage.createdAt,
            },
            sessionId,
        });
    }
}

/**
 * Move to STAGE 4D: Two Truths One Lie! 🎭
 */
async function moveToTwoTruths(sessionId: number, chatRoomId: number): Promise<void> {
    await prisma.chatHostSession.update({
        where: { id: sessionId },
        data: { currentStage: 'STAGE_4D', stageData: { answers: {} } },
    });

    const prompt = TWO_TRUTHS_PROMPTS[Math.floor(Math.random() * TWO_TRUTHS_PROMPTS.length)];

    const hostMessage = await prisma.chatHostMessage.create({
        data: {
            sessionId,
            senderType: 'host',
            content: `🎭 Classic Party Game Time!\n\n${prompt}\n\nThis is always fun - let's see who's the better detective! 🕵️`,
            messageType: 'question',
            metadata: {
                stage: 'STAGE_4D',
                gameType: 'two_truths',
                questionId: `truths_${Date.now()}`
            },
        },
    });

    const io = getSocketIO();
    if (io) {
        io.to(`chat:${chatRoomId}`).emit('host_message', {
            message: {
                id: hostMessage.id,
                senderType: 'host',
                content: hostMessage.content,
                messageType: hostMessage.messageType,
                metadata: hostMessage.metadata,
                createdAt: hostMessage.createdAt,
            },
            sessionId,
        });
    }

    // This one needs more time for interactive guessing
    setTimeout(async () => {
        await moveToHandoff(sessionId, chatRoomId);
    }, 60000); // 60 seconds for this game
}


/**
 * Move to STAGE 5: Handoff
 */
async function moveToHandoff(sessionId: number, chatRoomId: number): Promise<void> {
    await prisma.chatHostSession.update({
        where: { id: sessionId },
        data: { currentStage: 'STAGE_5', status: 'completed', completedAt: new Date() },
    });

    const handoffMessages = [
        `You both are doing amazing! 🎉 I've loved getting to know you through these questions. I'll step back now so you can continue the conversation naturally. If you ever want me back, just tap the 🤖 button!`,
        `This has been so fun! ✨ You both have great energy. I'll let you take it from here - you've got this! Feel free to call me back anytime with the 🤖 button.`,
        `You're both awesome! 🌟 I've enjoyed facilitating this conversation. Time for me to step back - you two can take it from here! Tap 🤖 if you want me back.`,
    ];

    const handoffMessage = handoffMessages[Math.floor(Math.random() * handoffMessages.length)];

    const hostMessage = await prisma.chatHostMessage.create({
        data: {
            sessionId,
            senderType: 'host',
            content: handoffMessage,
            messageType: 'text',
            metadata: { stage: 'STAGE_5', isHandoff: true },
        },
    });

    const io = getSocketIO();
    if (io) {
        io.to(`chat:${chatRoomId}`).emit('host_message', {
            message: {
                id: hostMessage.id,
                senderType: 'host',
                content: hostMessage.content,
                messageType: hostMessage.messageType,
                metadata: hostMessage.metadata,
                createdAt: hostMessage.createdAt,
            },
            sessionId,
        });

        io.to(`chat:${chatRoomId}`).emit('host_handoff', {
            sessionId,
        });
    }
}

/**
 * Exit host session
 * POST /api/host/:matchId/exit
 */
export const exitHost = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const matchId = parseInt(req.params.matchId);
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { chatRoom: { include: { hostSession: true } } },
        });

        if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
            res.status(403).json({ success: false, message: 'Access denied.' });
            return;
        }

        const session = match.chatRoom?.hostSession;
        if (!session || session.status !== 'active') {
            res.status(400).json({ success: false, message: 'Host session not active.' });
            return;
        }

        // Update session to exited status
        await prisma.chatHostSession.update({
            where: { id: session.id },
            data: {
                status: 'exited',
                currentStage: 'STAGE_6',
                completedAt: new Date(),
            },
        });

        // Send exit message
        const exitMessages = [
            `Thanks for the fun conversation! 🎉 I'll step back now so you can chat naturally. You've got this! 💪`,
            `It's been great! ✨ I'll let you two continue on your own. Feel free to bring me back anytime with the 🤖 button!`,
            `You both are doing great! 🌟 I'll step back now. Keep the conversation going - you've got plenty to talk about!`,
        ];

        const exitMessage = await prisma.chatHostMessage.create({
            data: {
                sessionId: session.id,
                senderType: 'host',
                content: exitMessages[Math.floor(Math.random() * exitMessages.length)],
                messageType: 'text',
                metadata: { stage: 'STAGE_6', isExit: true },
            },
        });

        // Emit socket event
        const io = getSocketIO();
        if (io && match.chatRoom) {
            io.to(`chat:${match.chatRoom.id}`).emit('host_message', {
                message: {
                    id: exitMessage.id,
                    senderType: 'host',
                    content: exitMessage.content,
                    messageType: exitMessage.messageType,
                    metadata: exitMessage.metadata,
                    createdAt: exitMessage.createdAt,
                },
                sessionId: session.id,
            });

            io.to(`chat:${match.chatRoom.id}`).emit('host_exited', {
                sessionId: session.id,
            });
        }

        res.status(200).json({
            success: true,
            message: 'Host session exited.',
        });
    } catch (error: any) {
        console.error('Exit host error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to exit host session.',
        });
    }
};

/**
 * Get host messages
 * GET /api/host/:matchId/messages
 */
export const getHostMessages = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const matchId = parseInt(req.params.matchId);
        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: { chatRoom: { include: { hostSession: { include: { messages: { orderBy: { createdAt: 'asc' } } } } } } },
        });

        if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
            res.status(403).json({ success: false, message: 'Access denied.' });
            return;
        }

        const messages = match.chatRoom?.hostSession?.messages || [];

        res.status(200).json({
            success: true,
            data: messages,
        });
    } catch (error: any) {
        console.error('Get host messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get host messages.',
        });
    }
};

