-- Migration: Add chat system tables
CREATE SCHEMA IF NOT EXISTS chat;

-- Conversations: one per customer+laundry pair
CREATE TABLE IF NOT EXISTS chat.conversations (
    conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    laundry_id VARCHAR(50) NOT NULL,
    customer_id VARCHAR(100) NOT NULL,
    customer_name VARCHAR(200),
    customer_phone VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active', -- active, closed
    last_message_at TIMESTAMP DEFAULT NOW(),
    unread_admin INT DEFAULT 0,
    unread_customer INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(laundry_id, customer_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS chat.messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES chat.conversations(conversation_id),
    sender_type VARCHAR(20) NOT NULL, -- 'customer' or 'admin'
    sender_id VARCHAR(100),
    sender_name VARCHAR(200),
    message TEXT NOT NULL,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON chat.messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_laundry ON chat.conversations(laundry_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON chat.conversations(customer_id, laundry_id);
