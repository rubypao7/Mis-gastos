"""Pruebas para la calculadora."""

import pytest

from calculadora import sumar, restar, multiplicar, dividir


def test_sumar():
    assert sumar(2, 3) == 5
    assert sumar(-1, 1) == 0


def test_restar():
    assert restar(5, 3) == 2
    assert restar(0, 4) == -4


def test_multiplicar():
    assert multiplicar(3, 4) == 12
    assert multiplicar(5, 0) == 0


def test_dividir():
    assert dividir(10, 2) == 5
    assert dividir(9, 3) == 3


def test_dividir_entre_cero():
    with pytest.raises(ValueError):
        dividir(1, 0)
