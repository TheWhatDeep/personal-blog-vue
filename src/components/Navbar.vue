<script setup>
import { RouterLink } from 'vue-router'
</script>
<template>
    <nav>
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/me">Just Me</RouterLink>
        <RouterLink to="/game">Play</RouterLink>
        <img src="/blog-logo.png" alt="logo">
    </nav>
</template>
<style scoped>
    nav {
        display: flex;
        justify-content: start;
        align-items: center;
        height: 70px;
    }
    a {
        text-decoration: none;
        color: #333;
        width: auto;
        margin-right: 20px;
        font-weight: 300;
    }
    img {
        margin: 0 20px 0 auto;
        width: 70px;
        height: auto;
    }
</style>